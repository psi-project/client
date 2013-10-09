/*
 * PSI Client Templates
 * 
 * Author: James Montgomery (james.montgomery at anu.edu.au)
 * 
 * Developed as part of the Protocols and Structures for Inference project: http://psi.cecs.anu.edu.au
 */

define(['jquery','underscore','psi.client','text!../../templates.html'], function($, _, client, templateHTML) {
	var module = {
		$templates: $(templateHTML),

		_templates: {},

		get: function (name) {
			if (! this._templates[name])
				this._templates[name] = _.template( this.$templates.find('#' + name).html().trim() );
			return this._templates[name];
		}
	};

	/**
	 * Can be mixed-in to the data sent to a template so it can format URIs
	 * and schema.
	 */
	module.ViewHelpers = {
		ppJSON: client.ppJSON,

		/**
		 * Version of ppJSON for displaying the fields of an object containing
		 * response header details. Only the first level of properties is
		 * displayed.
		 */
		ppHeader: function(obj) {
			return _.map(obj, function(v,k) { return k + ': ' + v; }).join('\n');
		},

		/**
		 * Removes hideThis + '/' from uri if it is defined.
		 * Deprecated since collections now generate suitable labels, although
		 * any query part still needs to be made 'neat' using .
		 */
		makeViewableURI: function (uri, hideThis) {
			hideThis = hideThis ? hideThis.replace(/\?.*$/,'') : hideThis;
			return (hideThis ? uri.replace(hideThis + '/', '') : uri).replace(/(\?.*)/,'<note>$1</note>');
		},

		/** Wraps any trailing URI query string, including the ?, in a <note>. */
		queryAsNote: function (uriLabel) {
			uriLabel = uriLabel.length < 50 ? uriLabel : uriLabel.substring(0,50) + '...';
			return uriLabel.replace(/(\?.*)/,'<note>$1</note>');
		},

		/**
		 * If the schema (pretty printed) is more than 1 line then creates two versions,
		 * each wrapped using the spanSchemaTemplate, on which click events can be
		 * bound to the toggleSchemaHandler from SchemaDisplayUtils.
		 */
		getSchemaForViewing: function(obj) {
			if (obj === undefined) return undefined;
			var spanSchemaTemplate = module.get('schema-text-template');
			var longSchema = this.ppJSON(obj);
			var eol = longSchema.indexOf('\n');
			var shortSchema = eol >= 0 ? longSchema.substring(0,eol) + ' ...' : null;
			return spanSchemaTemplate({ schema: longSchema, hide: shortSchema, togglable: shortSchema }) +
				( shortSchema ? spanSchemaTemplate({ schema: shortSchema, togglable: true }) : '' );
		},

		/** Allows a template to retrieve another named template. */
		template: function(name) {
			return module.get(name);
		}

	};

	return module;
});
