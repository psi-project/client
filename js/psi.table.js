/*
 * PSI Values to Table Converter
 * 
 * Author: James Montgomery (james.montgomery at anu.edu.au)
 * 
 * Developed as part of the Protocols and Structures for Inference project: http://psi.cecs.anu.edu.au
 */
 
define(['jquery','underscore'], function($, _) {
	var module = {};

	/**
	 * Generate a table DOM object based on the given value response and
	 * emitter model. Caches the table definition in the emitter.
	 */
	module.valueResponseToTable = function (emitter, value) {
		return module._valueToTable(value, module.getTableDefinition(emitter, value));
	};

	/**
	 * Returns a new or cached module table column definition for
	 * the given emitter, based on the given value response currently
	 * (although really should use schema).
	 */
	module.getTableDefinition = function (emitter, value) {
		if (! emitter.has('tableDefinition'))
			emitter.set({ tableDefinition: module.generateTableDefinition(value) }, { silent: true });
		return emitter.get('tableDefinition');
	};

	/**
	 * Version 1, derive the table structure from the structure of the value
	 * (or first value). Really should use the emits schema, but once generated
	 * is cached to save time later.
	 */
	module.generateTableDefinition = function (value) {
		var first = value.get('value') || value.get('valueList')[0];
		var def = { colsByDepth: [ [ { label: value.has('label') ? value.get('label') : 'Instance'} ] ] };
		def.parseTree = module._makeColumnTree(first, -1, def.colsByDepth);
		return def;
	};

	module._makeColumnTree = function (value, depth, colsByDepth, key, label) {
		if (colsByDepth.length < depth + 1) colsByDepth.push([]);

		var def = { key: key, width: 1, label: label };
		if (_.isArray(value) || _.isObject(value)) {
			var isArray = _.isArray(value);
			def.children = [];
			def.width--; //don't count self in columns spanned below
			for (var i in value) {
				var col = module._makeColumnTree(value[i], depth + 1, colsByDepth, i, isArray ? parseInt(i) + 1 : null);
				def.children.push( col );
				def.width += col.width;
			}
		} else if (depth == -1) { //an atomic value at the top of the tree
			def.label = 'value';
			colsByDepth[0].push( def );
		}
		if (depth >= 0) colsByDepth[depth].push( def );
		return def;
	};

	/**
	 * Generate a table DOM object based on the given value response using the given
	 * table definition).
	 */
	module._valueToTable = function (value, tableDef) {
		var table = document.createElement('table');
		$(table).addClass('resultTable');
		module.makeHeader(table, tableDef);
		var tbody = table.appendChild( document.createElement('tbody') );

		var values = value.has('value') ? [ value.get('value') ] : value.get('valueList');
		var instance = value.has('value') ? value.getInput() : 1;
		for (var i in values) {
			var row = tbody.insertRow(-1);
			row.insertCell(0).innerHTML = module._presentValue(instance);
			module._addValueToRow(values[i], row, tableDef.parseTree);
			instance++;
		}

		return table;
	};

	module.makeHeader = function (table, def) {
		table.deleteTHead();
		var header = table.createTHead();
		for (var d = 0, rowSpan = def.colsByDepth.length; d < def.colsByDepth.length; d++, rowSpan--) {
			var row = header.insertRow(d);
			for (i in def.colsByDepth[d]) {
				var col = def.colsByDepth[d][i];
				row.appendChild( module._th(col.label || col.key, col.children ? 1 : rowSpan, col.width) );
			}
		}
	};

	module._th = function (label, rowSpan, colSpan, className) {
		var th = document.createElement("th");
		th.innerHTML = label;
		if (colSpan && colSpan > 1) th.colSpan = colSpan;
		if (rowSpan && rowSpan > 1) th.rowSpan = rowSpan;
		if (className) th.className = className;
		return th;
	};

	module._addValueToRow = function (value, row, parseTree) {
		if (parseTree.children) {
			_.each(parseTree.children, function(child) { module._addValueToRow(value[child.key], row, child); } );
		} else {
			row.insertCell(-1).innerHTML = module._presentValue(value);
		}
	};
	
	var uriPattern = /^http%3A%2F%2F|data%3A/i;
	var httpPattern = /^http:\/\//;
	var imgDataURIPattern = /^data:image\//;
	
	/**
	 * Provides limited support for rendering data URI encoded images as images
	 * instead of text. Any value that isn't of the form 'data:image/.....' is
	 * returned unchanged. Also URI decodes any string value that begins with
	 * 'http' or 'data' and makes any 'http' value a link.
	 */
	module._presentValue = function (value) {
		if (uriPattern.test(value))
			value = decodeURIComponent(value);
		if (httpPattern.test(value))
			return '<a href="' + value + '" target="_blank">' + value + '</a>'; 
		else if (imgDataURIPattern.test(value))
			return '<img src="' + value + '">';
		return value;
	};

	return module;
});
