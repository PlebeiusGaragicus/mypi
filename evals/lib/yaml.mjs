// Strict loader for the small YAML subset used by eval case and variant files:
// nested maps, lists (of maps or scalars), block scalars (|), inline flow lists
// of plain scalars, quoted/plain scalars, and full-line comments. Anything the
// parser does not recognize is an error — a mis-indented or typo'd line must
// never silently vanish from a case suite.

import { readFileSync } from "node:fs";

export function loadYaml(text, source = "yaml") {
	const lines = text.split(/\r?\n/).map((line, idx) => {
		const indent = line.match(/^ */)[0].length;
		return { indent, body: line.slice(indent), no: idx + 1 };
	});
	const fail = (no, message) => {
		throw new Error(`${source}:${no}: ${message}`);
	};
	for (const line of lines) {
		if (/^\t/.test(line.body) && line.indent === 0) fail(line.no, "tabs are not allowed in indentation");
	}
	const skippable = (line) => line.body === "" || line.body.startsWith("#");

	let pos = 0;
	const peek = () => {
		while (pos < lines.length && skippable(lines[pos])) pos++;
		return pos < lines.length ? lines[pos] : null;
	};

	function unquote(value, no) {
		if (value.length >= 2 && ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))) {
			return value.slice(1, -1);
		}
		if (value.startsWith('"') || value.startsWith("'")) fail(no, `unterminated quoted scalar: ${value}`);
		return value;
	}

	function parseScalar(value, no) {
		if (value.startsWith("[")) {
			if (!value.endsWith("]")) fail(no, "unterminated flow list");
			const inner = value.slice(1, -1).trim();
			if (!inner) return [];
			return inner.split(",").map((item) => unquote(item.trim(), no));
		}
		return unquote(value, no);
	}

	// Consumes every following line more indented than the key (blank lines
	// included), dedented against the first content line.
	function parseBlockScalar(keyIndent, keyNo) {
		const collected = [];
		let blockIndent = null;
		while (pos < lines.length) {
			const line = lines[pos];
			if (line.body === "") {
				collected.push("");
				pos++;
				continue;
			}
			if (line.indent <= keyIndent) break;
			if (blockIndent === null) blockIndent = line.indent;
			if (line.indent < blockIndent) fail(line.no, "inconsistent indentation in block scalar");
			collected.push(" ".repeat(line.indent - blockIndent) + line.body);
			pos++;
		}
		while (collected.length && collected[collected.length - 1] === "") collected.pop();
		if (!collected.length) fail(keyNo, "empty block scalar");
		return `${collected.join("\n")}\n`;
	}

	function parseMap(indent) {
		const map = {};
		while (true) {
			const line = peek();
			if (!line || line.indent < indent) return map;
			if (line.indent > indent) fail(line.no, `unexpected indentation (expected ${indent} spaces)`);
			if (line.body.startsWith("- ")) return map;
			const match = line.body.match(/^([^\s:]+):( .*)?$/);
			if (!match) fail(line.no, `cannot parse line: ${line.body}`);
			const key = match[1];
			if (key in map) fail(line.no, `duplicate key: ${key}`);
			const rest = match[2] === undefined ? "" : match[2].trim();
			pos++;
			if (rest === "") {
				const next = peek();
				if (!next || next.indent <= indent) fail(line.no, `key '${key}' has no value`);
				map[key] = next.body.startsWith("- ") ? parseList(next.indent) : parseMap(next.indent);
			} else if (rest === "|") {
				map[key] = parseBlockScalar(indent, line.no);
			} else {
				map[key] = parseScalar(rest, line.no);
			}
		}
	}

	function parseList(indent) {
		const list = [];
		while (true) {
			const line = peek();
			if (!line || line.indent < indent) return list;
			if (line.indent > indent) fail(line.no, `unexpected indentation (expected ${indent} spaces)`);
			if (!line.body.startsWith("- ")) fail(line.no, `expected a '- ' list item, got: ${line.body}`);
			const rest = line.body.slice(2).trim();
			if (!rest) fail(line.no, "empty list item");
			const itemIndent = line.indent + 2;
			if (/^[^\s:]+:( |$)/.test(rest)) {
				// Map item: re-enter the map parser with the inline first key
				// shifted to the item's indent column.
				lines[pos] = { indent: itemIndent, body: rest, no: line.no };
				list.push(parseMap(itemIndent));
			} else {
				pos++;
				list.push(parseScalar(rest, line.no));
			}
		}
	}

	const first = peek();
	if (!first) fail(1, "document is empty");
	const document = first.body.startsWith("- ") ? parseList(first.indent) : parseMap(first.indent);
	const trailing = peek();
	if (trailing) fail(trailing.no, `unexpected content after document: ${trailing.body}`);
	return document;
}

export function loadYamlFile(filePath) {
	return loadYaml(readFileSync(filePath, "utf8"), filePath);
}
