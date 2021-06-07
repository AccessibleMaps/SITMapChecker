/*
 * This file is part of OsmInEdit, released under ISC license (see LICENSE.md)
 *
 * Copyright (c) Adrien Pavie 2019
 * Copyright (c) Daimler AG 2019
 *
 * Permission to use, copy, modify, and/or distribute this software for any purpose with or without fee is hereby granted, provided that the above copyright notice and this permission notice appear in all copies.
 *
 * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
 *
 */

import deepEqual from 'fast-deep-equal';

/**
 * Simple object check.
 * @private
 */
const _isObject = (item) => {
	return (item && typeof item === 'object' && !Array.isArray(item));
};

/**
 * Deep merge two objects.
 */
const mergeDeep = (target, ...sources) => {
	if (!sources.length) return target;
	const source = sources.shift();

	if (_isObject(target) && _isObject(source)) {
		for (const key in source) {
			if (_isObject(source[key])) {
				if (!target[key]) Object.assign(target, { [key]: {} });
				mergeDeep(target[key], source[key]);
			}
			else if(Array.isArray(source[key]) && Array.isArray(target[key])) {
				target[key] = target[key].concat(source[key]);
			}
			else {
				Object.assign(target, { [key]: source[key] });
			}
		}
	}

	return mergeDeep(target, ...sources);
};

/**
 * Return array of coordinates with a precision of 8 digits (OSM)
 */
const fixPrecision = coords => coords.map(c => {
	if(typeof c === "string") { c = parseFloat(c); }
	return parseFloat(c.toFixed(8));
});

/**
 * List of common elements between two arrays (intersection)
 */
const intersectionArray = function(arrA, arrB) {
	const common = [];
	const minimal = arrA.length < arrB.length ? arrA : arrB;
	const other = arrA.length < arrB.length ? arrB : arrA;

	minimal.forEach(el => {
		if(other.find(el2 => deepEqual(el, el2)) && !common.find(el2 => deepEqual(el, el2))) {
			common.push(el);
		}
	});

	return common;
}

export { mergeDeep, fixPrecision, intersectionArray };
