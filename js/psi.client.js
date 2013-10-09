/*
 * Basic (no GUI) PSI Client app
 * 
 * Author: James Montgomery (james.montgomery at anu.edu.au)
 * 
 * Developed as part of the Protocols and Structures for Inference project: http://psi.cecs.anu.edu.au
 */

define(['underscore','psi.schema'], function(_, schema) {
	return {
		version: '2.0',
		working: false,
		schemaCompilers: {},
		//These are effectively stubs that can be called by model classes even when they are not embedded in the original client web page with its templates, etc.
		startWorking: function (message) {
			this.working = true;
			console.log( message ? message : 'Working' );
		},
		stopWorking: function () { this.working = false; },
		showSuccess: function (message) { this.stopWorking(); console.log( message ? message : 'Last action successful' ); },
		showError: function (message, details) { this.stopWorking(); console.log( message + ( details ? '\nDetails:\n' + this.ppJSON(details) : '' ) ); },

		/** Here this is a stub that logs the message to the console; in a GUI app should show a dialog message.
		 * title and type are ignored. */
		showMessageDialog: function(message,title,type) { this.stopWorking(); console.log(message); },

		//For demonstration, not actually for logging; a Client view can post these to a list of some sort to illustrate the communication between the client and server.
		logRequest: function(request, to) { },
		logResponse: function(response, from, isHeader) { },

		/**
		 * Returns a schema compiler that uses the given schema root URI, or
		 * http://poseidon.cecs.anu.edu.au/schema if uri is not given. This
		 * allows low-level resources to obtain a schema compiler even if they
		 * do not 'belong' to a full-blown PSI service.
		 */
		getSchemaCompiler: function(uri) {
			uri = uri || 'http://poseidon.cecs.anu.edu.au/schema';
			//Strictly speaking all schema roots should be the same, in that any non-
			// canonical schema must be expressed using its full URI, but just in
			// case this will maintain a different compiler for each given root.
			if (!_.has(this.schemaCompilers,uri))
				this.schemaCompilers[uri] = new schema.Compiler( uri );
			return this.schemaCompilers[uri];
		},
		
		/**  Returns string values unchanged, and all other values as (pretty printed) JSON. */
		ppJSON: function (obj) { return _.isString(obj) ? obj : JSON.stringify(obj, null, 2); }
	};

});
