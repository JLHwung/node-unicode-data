'use strict';

const fs = require('fs');
const path = require('path');
const jsesc = require('jsesc');
const regenerate = require('regenerate');
const mkdirp = require('mkdirp');

const range = function(start, stop) {
	// inclusive, e.g. `range(1, 3)` → `[1, 2, 3]`
	for (var result = []; start <= stop; result.push(start++));
	return result;
};

const object = {};
const hasOwnProperty = object.hasOwnProperty;
const hasKey = function(object, key) {
	return hasOwnProperty.call(object, key);
};

const append = function(object, key, value) {
	if (hasKey(object, key)) {
		object[key].push(value);
	} else {
		object[key] = [value];
	}
};

const writeFiles = function(options) {
	const version = options.version;
	const map = options.map;
	if (map == null) {
		return;
	}
	const dirMap = {};
	const auxMap = {};
	Object.keys(map).forEach(function(item) {
		const codePoints = map[item];
		const type = typeof options.type == 'function'
			? options.type(item)
			: options.type;
		const isCaseFolding = type == 'case-folding';
		const isBidiClass = type == 'bidi-classes';
		if (isBidiClass) {
			item = item.replace(/^Bidi_/, '');
		}
		const dir = path.resolve(
			__dirname, '..',
			'output', 'unicode-' + version, type, item
		);
		if (
			type == 'bidi-classes' ||
			type == 'bidi-mirroring' ||
			type == 'bidi-brackets' ||
			(type == 'categories' && /^[A-Z][a-z]$/.test(item))
		) {
			if (!auxMap[type]) {
				auxMap[type] = [];
			}
			codePoints.forEach(function(codePoint) {
				console.assert(!auxMap[type][codePoint]);
				auxMap[type][codePoint] = item;
			});
		}
		if (type == 'bidi-mirroring') {
			return;
		}
		append(dirMap, type, item);
		// Create the target directory if it doesn’t exist yet
		mkdirp.sync(dir);
		// Save the data to a file
		fs.writeFileSync(
			path.resolve(dir, 'code-points.js'),
			'module.exports=' + jsesc(codePoints)
		);
		if (!isCaseFolding) {
			fs.writeFileSync(
				path.resolve(dir, 'regex.js'),
				'module.exports=/' + regenerate(codePoints).toString() + '/'
			);
		}
		fs.writeFileSync(
			path.resolve(dir, 'symbols.js'),
			'module.exports=' + jsesc(
				isCaseFolding ?
					Object.keys(codePoints).reduce(function(result, current) {
						let mappings = codePoints[current];
						if (Array.isArray(mappings)) {
							mappings = String.fromCodePoint.apply(null, mappings);
						} else {
							mappings = String.fromCodePoint(mappings);
						}
						result[String.fromCodePoint(current)] = mappings;
						return result;
					}, {}) :
					codePoints.map(function(codePoint) {
						return String.fromCodePoint(codePoint);
					}))
		);
	});
	Object.keys(auxMap).forEach(function(type) {
		const dir = path.resolve(
			__dirname, '..',
			'output', 'unicode-' + version, type
		);
		if (!hasKey(dirMap, type)) {
			dirMap[type] = [];
		}
		mkdirp.sync(dir);
		let output = '';
		if (/^(bidi-classes|bidi-mirroring|bidi-brackets)$/.test(type)) {
			const map = new Map();
			Object.keys(auxMap[type]).forEach(function(key) {
				const codePoint = Number(key);
				const value = auxMap[type][key];
				map.set(codePoint, value);
			});
			// TODO: `const mapArray = [...map];` and minify it by removing repeated
			// strings. https://github.com/mathiasbynens/node-unicode-data/issues/27
			output = `module.exports=${ jsesc(map) }`;
		} else { // `categories/index.js`
			// TODO: Minify `array` by removing repeated strings.
			// https://github.com/mathiasbynens/node-unicode-data/issues/27
			const array = auxMap[type];
			output = `var x=${ jsesc(array) };module.exports=new Map(x.entries())`;
		}
		fs.writeFileSync(
			path.resolve(dir, 'index.js'),
			output
		);
	});
	return dirMap;
};

const extend = function(destination, source) {
	for (var key in source) {
		if (hasKey(source, key)) {
			if (!hasKey(destination, key)) {
				destination[key] = [];
			}
			source[key].forEach(function(item) {
				append(destination, key, item);
			});
		}
	}
};

const readDataFile = function(version, type) {
	const sourceFile = path.resolve(
		__dirname, '..',
		'data', version + '-' + type + '.txt'
	);
	if (!fs.existsSync(sourceFile)) {
		return;
	}
	const source = fs.readFileSync(sourceFile, 'utf-8');
	return source;
};

module.exports = {
	'range': range,
	'append': append,
	'extend': extend,
	'readDataFile': readDataFile,
	'writeFiles': writeFiles
};
