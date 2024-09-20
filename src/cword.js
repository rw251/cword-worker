import { decode } from 'html-entities';

let crosswordList;
let crosswordObject = {};
let limits;

// const fetchTimeout = (url, ms, { signal, ...options } = {}) => {
// 	const controller = new AbortController();
// 	const promise = fetch(url, { signal: controller.signal, ...options });
// 	if (signal) signal.addEventListener('abort', () => controller.abort());
// 	const timeout = setTimeout(() => controller.abort(), ms);
// 	return promise.finally(() => clearTimeout(timeout));
// };

//
const options = {
	headers: {
		// Host: 'www.theguardian.com',
		'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:130.0) Gecko/20100101 Firefox/130.0',
		// DNT: 1,
		'Sec-GPC': 1,
		// Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/png,image/svg+xml,*/*;q=0.8',
		'Accept-Language': 'en-GB,en;q=0.5',
		// 'Accept-Encoding': 'gzip, deflate, br, zstd',
		Connection: 'keep-alive',
	},
};

const getCrosswordPromise = (type, id) => {
	console.log(`Fetching ${type} ${id}`);

	return fetch(`https://www.theguardian.com/crosswords/${type}/${id}`, options)
		.then((x) => {
			return x.text();
		})
		.then((html) => {
			console.log(`Got ${type} ${id}`);
			return html;
		})
		.then((html) => JSON.parse(decode(html.match(/data-crossword-data="([^"]+)"/)[1])))
		.catch((e) => {
			console.log(`Error fetching ${type}, ${id}`);
			console.log(e);
		});
};

async function getBits(env) {
	crosswordList = JSON.parse((await env.CWORD_KV.get('list.json')) || '{"cryptic":[],"prize":[],"quick":[]}');
	limits = JSON.parse((await env.CWORD_KV.get('limits.json')) || '{"cryptic":{},"prize":{},"quick":{}}');
	Object.keys(crosswordList).forEach((type) => {
		crosswordObject[type] = crosswordList[type].reduce((p, c) => {
			p[c.id] = true;
			return p;
		}, {});
	});
}

const recursiveGet = (type = 'cryptic', page = 1) => {
	let isNew = false;
	const regex = new RegExp(`href="\/crosswords\/${type}\/([0-9]+)`, 'g');
	console.log(`Getting page ${page} of ${type} crosswords...`);
	return fetch(`https://www.theguardian.com/crosswords/series/${type}?page=${page}`, options)
		.then((x) => {
			return x.text();
		})
		.then((html) => {
			//'a[href^="/crosswords/cryptic/"]')
			html.match(regex).map((x) => {
				//html.match(/class="fc-item [\s\S]+?datetime="[^"]+"/g).map((x) => {
				const crosswordId = +x.match(/\/([0-9]+)/)[1];
				// const date = x.match(/datetime="([^"]{10})/)[1];
				if (!crosswordObject[type][crosswordId] && crosswordId > 3000) {
					console.log(`${crosswordId} of type ${type} not in our list`);
					isNew = true;
					crosswordObject[type][crosswordId] = true;
					crosswordList[type].push({ id: crosswordId });
				}
			});
		})
		.catch(() => ({}))
		.then(() => {
			if (isNew && page < 5) {
				return recursiveGet(type, page + 1);
			}
			crosswordList[type].sort((a, b) => b.id - a.id);
			return true;
		});
};

async function updateListDotJson(env) {
	await recursiveGet('cryptic', 1);
	await recursiveGet('prize', 1);
	await recursiveGet('quick', 1);
	await env.CWORD_KV.put('list.json', JSON.stringify(crosswordList));
}

function alreadyGot(type, id) {
	return limits[type].first && limits[type].last && limits[type].first <= id && limits[type].last >= id;
}

async function getNLatestCrosswords(type, n) {
	const crosswordsToGet = crosswordList[type]
		.filter((y) => !alreadyGot(type, y.id))
		.slice(0, n)
		.map((x) => x.id);
	const crosswordPromises = crosswordsToGet.map((x) => getCrosswordPromise(type, x));
	const crosswords = await Promise.all(crosswordPromises);
	return crosswords;
}

async function update(env) {
	await getBits(env);
	await updateListDotJson(env);
	const crosswords = await getNLatestCrosswords('cryptic', 1);
	for (let c of crosswords) {
		if (c.number) {
			await env.CWORD_KV.put(`cryptic-${c.number}.json`, JSON.stringify(c));
			if (!limits.cryptic.first) {
				limits.cryptic.first = c.number;
				limits.cryptic.last = c.number;
			} else {
				if (c.number > limits.cryptic.last) limits.cryptic.last = c.number;
				if (c.number < limits.cryptic.first) limits.cryptic.first = c.number;
			}
		}
	}

	const prizeCrosswords = await getNLatestCrosswords('prize', 1);

	for (let c of prizeCrosswords) {
		if (c.number) {
			await env.CWORD_KV.put(`prize-${c.number}.json`, JSON.stringify(c));
			if (!limits.prize.first) {
				limits.prize.first = c.number;
				limits.prize.last = c.number;
			} else {
				if (c.number > limits.prize.last) limits.prize.last = c.number;
				if (c.number < limits.prize.first) limits.prize.first = c.number;
			}
		}
	}

	const quickCrosswords = await getNLatestCrosswords('quick', 1);

	for (let c of quickCrosswords) {
		if (c.number) {
			await env.CWORD_KV.put(`quick-${c.number}.json`, JSON.stringify(c));
			if (!limits.quick.first) {
				limits.quick.first = c.number;
				limits.quick.last = c.number;
			} else {
				if (c.number > limits.quick.last) limits.quick.last = c.number;
				if (c.number < limits.quick.first) limits.quick.first = c.number;
			}
		}
	}

	await env.CWORD_KV.put('limits.json', JSON.stringify(limits, null, 2));
	console.log('Done');
}

// /////////////////////// Update list.json with the latest quick, prize and cryptic numbers
// updateListDotJson().then(() => {
// 	// //////////////////// get the n most recent crosswords of each type

//getCrosswordPromise('cryptic', 28369);

export { update };
