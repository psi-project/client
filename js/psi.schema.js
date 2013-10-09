/*
 * PSI Schema Compiler 1.1
 * 
 * Author: James Montgomery (james.montgomery at anu.edu.au)
 * 
 * Developed as part of the Protocols and Structures for Inference project: http://psi.cecs.anu.edu.au
 */
 
define(['jquery','underscore'], function($, _) {
	var module = {};

	/** Constants to indicate which version of JSON Schema should be used. */
	var SchemaVersions = module.JSONSchemaVersions = {
		'DRAFTV3' : 'http://json-schema.org/draft-03/schema#',
		//FIXME Change this to hyper-schema when certain that tv4 validator actually supports it
		'DRAFTV4' : 'http://json-schema.org/draft-04/schema#'
	};

	function schemaVersionIsOK(version) { return version && _.contains(_.values(SchemaVersions), version); }

	//FIXME Need a way to set this application-wide setting through RequireJS, rather than treating this point as the configuration (which defeats the point of being able to change it later).
	var defaultSchemaVersion = SchemaVersions.DRAFTV4;

	module.getJSONSchemaVersion = function() { return defaultSchemaVersion; };

	/**
	 * Sets the JSON Schema version to compile to. Current supported versions
	 * are draft v3 and draft v4, which are identified by the properties of
	 * module.JSONSchemaVersions.
	 */
	module.setJSONSchemaVersion = function(version) {
		if ( ! schemaVersionIsOK(version) )
			throw new Error('Unsupported JSON Schema version "' + version + '". Supported versions are: ' + _.values(SchemaVersions).join());
		defaultSchemaVersion = version;
	};

	/**
	* An extremely simple version of jQuery's param() that uses JSON string
	* representations for the value of each property of the args object; any
	* nested objects are converted to their JSON representation.
	*/
	module.args2Query = function (args) {
		var q = _.map(args, function(value, key) {
			return encodeURIComponent(key) + '=' + encodeURIComponent( JSON.stringify(value) );
		});
	    return q.join( '&' ).replace( /%20/g, '+' );
	};

	/**
	 * My addition is to use the given schema (which can be the simple version
	 * as used by jsonform or a genuine JSON schema [PSI schema must be
	 * compiled first] to do  some basic conversions on the string values. The 
	 * schema argument can be null for simple key to string value  behaviour.
	 */
	module.query2Args = function (querystring, schema) {
		//The following two lines have been adapted from:
	 	// http://stevenbenner.com/2010/03/javascript-regex-trick-parse-a-query-string-into-an-object/
		var args = {};
		querystring.replace( new RegExp("([^?=&]+)(=([^&]*))?", "g"), function($0, $1, $2, $3) { args[$1] = $3; } );
		if (schema) {
			if (schema.type && schema.type === 'object' && schema.properties) { schema = schema.properties; }
			for (p in schema)
				if (args[p]) { args[p] = convert(args[p], schema[p].type); }
		}
		return args;
	};
	
	/** Returns an array of the media types specified by the PSI rich value schema s, or null if none are specified. */ 
	module.getMediaTypes = function (s) {
		var justMediaType = function(s) { return s.replace(/^@/, ''); };
		if (_.isString(s) && /^@/.test(s)) {
			return [ justMediaType(s) ];
		} else if (_.isObject(s)) {
			var others = s.anyOf || s.oneOf;
			if (others)
				return _.map(_.filter(others, function(other) { return /^@/.test(other); }), justMediaType);
			var keys = _.keys(s);
			if (keys.length == 1 )
				return module.getMediaTypes(keys[0]);
		}
		return null;
	};
	
	function convert(value, type) {
		switch (type) {
			case 'integer': return parseInt(value);
			case 'number': return parseFloat(value);
			case 'boolean': return value === 'true';
			default: return value;
		}
	}

	var SchemaContext = module.Context = function (schemaRootURI) {
		if ( !(this instanceof arguments.callee) )
			throw new Error("Constructor called as a function");
		this.schemaRootURI = schemaRootURI + (/\/$/.test(schemaRootURI) ? '' : '/');
		this.local = {};
		this.cache = {};
		this.add = function(id, schema) { this.local[id] = schema; };
		/**
		* If the identified schema is in the local context then returns it immediately,
		* otherwise returns a jQuery.Deferred that will be resolved when the identified
		* schema has been.
		*/
		this.resolve = function (id, args) {
			if (_.has(this.local, id))
				return this.local[id];
			if (args !== undefined && args !== null && !_.isObject(args))
				throw new Error('Cannot resolve schema ' + id + ' using given arguments, which MUST be in the form of an object. Given arguments: ' + JSON.stringify(args));
			var schemaURI = ( /^http:\/\//.test(id) ? '' : this.schemaRootURI ) + id 
				+ ( args === undefined || args === null ? '' : '?' + module.args2Query(args) );
			var cache = this.cache;
			if (_.has(cache, schemaURI))
				return cache[schemaURI];
			//This extra layer is so can return a more meaningful error message upon failure.
			var wrappedGet = new $.Deferred();
			$.getJSON(schemaURI)
				.success( function(data) { cache[schemaURI] = data; wrappedGet.resolve(data); } )
				.error( function(data) { wrappedGet.reject('Error resolving schema at "' + schemaURI + '". Details: ' + data.statusText); } );
			return wrappedGet;
		};
	};

	module.Compiler = function PSISchemaCompiler(schemaRootURI, schemaVersion) {
		if ( !(this instanceof arguments.callee) )
			throw new Error("Constructor called as a function");

		this.schemaURI = schemaRootURI;
		this.schemaVersion = schemaVersionIsOK(schemaVersion) ? schemaVersion : defaultSchemaVersion;

		this.compileFromText = function (psiSchemaText) {
			return this.compile( eval('(' + psiSchemaText + ')') );
		};

		/**
		 * Returns a jQuery.Deferred object that is resolved when all externally
		 * defined shema referenced in the PSI schema have been resolved.
		 */
		this.compile = function (psiSchema) {
			var deferred = new $.Deferred();
			var schemaVersion = this.schemaVersion;
			$.when( this._compile(psiSchema, new SchemaContext(this.schemaURI)) )
				.done( function(result) {
					//assert: result is an object
					result['$schema'] = schemaVersion;
					deferred.resolve(result);
				})
				.fail( function(reason) { deferred.reject(reason); } );
			return deferred;
		};

		this._compile = function (S, C) {
			if ( _.isNumber(S) || _.isBoolean(S) )
				return S;
			if ( _.isString(S)) {
				if (S.charAt(0) === '$')
					return this._resolveAndCompile( S.substr(1), C );
				else if (S.charAt(0) === '@')
					return { type: "string", format: "uri", mediaType: S.substr(1) };
				return S;
			}
			if ( _.isArray(S) )
				return this._compileArray(S, C);
			if ( _.isObject(S) )
				return this._compileObject(S, C);
			//Should not reach this point
			throw new Error('Current element in schema is none of the expected number, boolean, string, array or object: ' + S);
		};

		this._resolveAndCompile = function (S, C, args) {
			var deferred = new $.Deferred();
			var compiler = this;
			$.when( C.resolve( S, args ) ).done( function(R) {
				$.when( compiler._compile(R, C) )
					.done( function(R2) { deferred.resolve( R2 ); })
					.fail( function(reason) { deferred.reject(reason); } );
			})
			.fail( function(reason) { deferred.reject(reason); } );
			return deferred;
		};

		this._compileArray = function (S, C) {
			var deferred = new $.Deferred();
			$.when.apply($, _.map(S, function(s) { return this._compile(s, C); }, this) )
				.done( function() { deferred.resolve( Array.prototype.slice.call(arguments) ); } )
				.fail( function(reason) { deferred.reject(reason); });
			return deferred;
		};

		this._compileObject = function (S, C, keys) {
			//Add locally defined schema to context
			var localSchema = _.filter(_.keys(S), function(K) { return K.charAt(0) === '#'; });
			_.each( localSchema, function(K) { C.add(K.substr(1), S[K]); } );
			S = _.omit(S, localSchema);
			//Identify any $-referenced schema present; replace current schema with its resolved form
			var schemaRef = _.find(_.keys(_.omit(S, ['$ref', '$schema'])), function(K) { return K.charAt(0) === '$'; } );
			if (schemaRef)
				return this._resolveAndCompile( schemaRef.substr(1), C, S[schemaRef] );

			//Then build rest of object schema
			var deferredProps = [];
			var result = {};
			_.each(S, function(V, K) {
				if ( K.charAt(0) === '/' || K.charAt(0) === '?' ) {
					deferredProps.push( this._addObjectProperty(result, K, V, C) );
				} else {
					var keyToUse = K;
					if ( K === 'allItems' ) {
						keyToUse = 'items';
					} else if ( K === '/*') {
						keyToUse = 'additionalProperties';
						this._setTypeObject(result);
					}
					deferredProps.push(
						$.when( this._compile(V, C) )
							//must create a closure to hold current value of keyToUse
							.done( (function(key) { return (function(compiled) { result[key] = compiled; }); })(keyToUse) )
					);
				}
			}, this);

			var deferredResult = new $.Deferred;
			$.when.apply($, deferredProps)
				.done( function() { deferredResult.resolve( result ); } )
				.fail( function(reason) { deferredResult.reject(reason); } );
			return deferredResult;
		};

		this._setTypeObject = function (S) { S['type'] = 'object'; };

		this._addObjectProperty = function (result, K, V, C) {
			this._setTypeObject(result);
			var required = K.charAt(0) === '/';
			var fixedValue = /=$/.test(K);
			var key = K.substr(1);
			if (fixedValue)
				key = key.substr(0, key.length - 1);

			var schemaVersion = this.schemaVersion;
			return $.when( this._compile(V, C) ).done( function(valueToUse) {
				if (fixedValue)
					valueToUse = { enum: [ valueToUse ] };
				//In draft v3, 'required' is a property of the schema for the property in question,
				//whereas in draft v4 'required' is a list of required properties' names in the object's schema.
				if (required) {
					if (schemaVersion === SchemaVersions.DRAFTV3) {
						valueToUse['required'] = true;
					} else {
						result.required = result.required || [];
						result.required.push(key);
					}
				}
				result.properties = result.properties || {};
				result.properties[key] = valueToUse;
			});
		};
	};
	
	/**
	 * If the given JSON Schema describes objects and the schema for those
	 * objects' properties do not have titles, then titles will be created
	 * from the properties' names. This will be done for any nested object
	 * schema found. For convenience, returns the given JSON schema object.
	 */
	module.addTitlesToProperties = function (jsonSchema) {
		if (jsonSchema.properties) {
			_.each(jsonSchema.properties, function(schema, key) {
				if (schema.title === undefined)
					schema.title = key;
			if (schema.type && schema.type === 'object')
				this.addTitlesToProperties(schema);
			}, this);
		}
		return jsonSchema;
	};

	return module;
});
