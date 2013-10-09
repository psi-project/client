/*
 * PSI form generation utilities
 * 
 * Author: James Montgomery (james.montgomery at anu.edu.au)
 * 
 * Developed as part of the Protocols and Structures for Inference project: http://psi.cecs.anu.edu.au
 */

define(['jquery','underscore','backbone','psi.schema','tv4_as_jsv'], function($, _, Backbone, psi_schema, tv4_as_jsv) {
	var module = {};

	//TODO Code to be reviewed and pahts through form generation to be streamlined for those kinds of forms that are created

	/** Schema for string property with default value. */
	module.FixedValueSchema = function FixedValueSchema(value) {
		if (!(this instanceof FixedValueSchema)) { throw new Error("Constructor called as a function"); }
		this.type = 'string';
		this['default'] = value;
	};

	//Form generation schema
	module.BaseRequestSchema = function BaseRequestSchema(psiType) {
		if ( !(this instanceof BaseRequestSchema) ) { throw new Error("Constructor called as a function"); }
		module.addRequestType(this, psiType);
	};

	module.SchemaWithURI = function SchemaWithURI(uri) { 
		if ( !(this instanceof SchemaWithURI) ) { throw new Error("Constructor called as a function"); }
		module.addURI(this, uri);
	};

	module.addRequestType = function (schema, psiType) { schema.psiType = new module.FixedValueSchema(psiType); };

	module.addURI = function (schema, uri) { schema.uri = new module.FixedValueSchema(uri); };

	module.getBaseRequestForm = function (psiType) {
		var result = [ { key: 'uri', type: 'hidden' } ];
		if (psiType) result.push( { key: 'psiType', type: 'hidden' });
		return result;
	};

	module.makeSchema = function (psiType, fieldSchema) {
		if (this._isObjectSchema(fieldSchema)) { //have to take more tedious approach with full JSON Schema
			var result = _.clone(fieldSchema);
			result.properties = _.clone(result.properties); //create separate hash of properties so not modifying given fieldSchema.properties
			if (psiType) this.addRequestType(result.properties, psiType);
			return result;
		}
		return _.extend( new this.BaseRequestSchema(psiType), fieldSchema );
	};

	module.addOptionalDescriptions = function (fieldSchema, v4Required) {
		if (this._isObjectSchema(fieldSchema)) {
			this.addOptionalDescriptions(fieldSchema.properties, fieldSchema.required);
		} else {
			_.each(fieldSchema, function (schema, field) {
				if (this._isObjectSchema(schema))
					this.addOptionalDescriptions(schema.properties, schema.required);
				else {
					schema.description = schema.description || '';
					//Supports both draft v3 and draft v4 schema approaches to specifying required properties
					if (! (schema.type === 'boolean' || schema.required || 
							_.contains(v4Required, field) || /\(optional\)$/.test(schema.description)) ) {
						schema.description = schema.description + (schema.description.length > 0 ? ' ' : '') + '(optional)';
					}
				}
			}, this);
		}
		return fieldSchema;
	};

	module.makeRequestFields = function (psiType, fieldNames, submitLabel, help, options) {
		return module._makeFields( this.getBaseRequestForm(psiType), fieldNames, submitLabel, help, options);
	};

	module.makeFields = function (fieldNames, submitLabel, help, options) {
		return module._makeFields([], fieldNames, submitLabel, help, options);
	};

	/**
	 * Define the fields array expected by jsonform. submitLabel and help can be set
	 * to null to supress the submit button and top help message, respectively.
	 */
	module._makeFields = function (result, fieldNames, submitLabel, help, options) {
		if (help) result.push( { type: 'help', helpvalue: help } );
		result = result.concat(fieldNames);
		if (submitLabel) result.push( { type: 'submit', title: submitLabel } );
		//FIXME Can this be made more efficient?
		if (options) {
			this._applyTypeToFields(result, options.textareas, 'textarea');
			this._applyTypeToFields(result, options.fixed, 'hidden');
		}
		return result;
	};

	module._asArray = function (value) { return _.isArray(value) ? value : [ value ]; };

	module._applyTypeToFields = function (fields, targets, type) {
		if (targets === undefined) return;
		targets = this._asArray(targets);
		_.each(fields, function (field, i) {
			if (_.include(targets,field))
				fields[i] = { key: field, type: type };
		});
	};

	module.FormData = function FormData(schema, formFields, options) {
		if ( !(this instanceof FormData) ) { throw new Error("Constructor called as a function"); }
		this.schema = schema;
		this.form = formFields;
		if (options) this.jsonFields = options.jsonFields;
		if (psi_schema.getJSONSchemaVersion() === psi_schema.JSONSchemaVersions.DRAFTV3) {
			this.displayErrors = function (errors, formEl) {
				_.each(errors, function (error, i) {
					//show details, but if the details are 'true' then it's likely to be uninformative to include them
					if (error.details && error.details !== true) errors[i].message = errors[i].message + ': ' + error.details;
				});
				$(formEl).jsonFormErrors(errors, this);
			};
		} else { //Must be draft v4, use modified tv4
			this.validate = tv4_as_jsv;
		}
	};

	/**
	 * A class that can be mixed in with a form data object that will
	 * perform JavaScript syntax checking on form submission; if it's
	 * valid then will call the given onSubmitValid with the processed
	 * data first and the original data as a second argument. The original
	 * data is saved in this.value. If the jsonform definition doesn't
	 * contain a jsonFields property then does no additional validation
	 * and merely passes data as both arguments to onSubmitValid.
	 */
	module.JSONValidatingOnSubmit = function JSONValidatingOnSubmit(formEl, onSubmitValid) {
		if ( !(this instanceof JSONValidatingOnSubmit) ) { throw new Error("Constructor called as a function"); }

		this.onSubmit = function (errors, data) {
			this.value = _.extend({}, data); //save copy of data for use when next form next used
			var jsonErrors = null;
			if (this.jsonFields) {
				jsonErrors = module.postprocessJSONFields(data, this.jsonFields);
				if (jsonErrors)
					formEl.jsonFormErrors(jsonErrors.concat(errors ? errors : []), this);
			}
			if (! (errors || jsonErrors))
				onSubmitValid(data, this.value);
		};
	};

	module._isObjectSchema = function (schema) { return schema.type === 'object' && _.isObject(schema.properties); };

	module.extractFieldNames = function extractFieldNames(schema) {
		return _.keys( this._isObjectSchema(schema) ? schema.properties : schema );
	};

	/**
	 * If psi_schema.getJSONSchemaVersion() is DRAFTV3 then returns fieldSchema
	 * unchanged, but if it is DRAFTV4 then takes a properties-only jsonform
	 * schema and makes it JSON Schema draft v4 compliant by wrapping it in a
	 * type: object, properties: ... construct and, most importantly, putting
	 * the 'required' array of required fields' names inside that (and hence not
	 * inside the simple schema. Any 'required: true' entries inside individual
	 * field's schema are used to populate the array of required fields. Note 
	 * that it only works on the first level of keys.
	 */
	module.getV4CompliantSchema = function (fieldSchema) {
		if (psi_schema.getJSONSchemaVersion() == psi_schema.JSONSchemaVersions.DRAFTV3)
			return fieldSchema;
		var result = { type: 'object', properties: fieldSchema };
		var required = _.filter( _.keys(fieldSchema), function(k) { return fieldSchema[k]['required']; } );
		if (required.length)
			result.required = required;
		return result;
	};

	/** Create schema and forms array for a form mapped to a PSI request. */
	module.makeRequestFormData = function (psiType, submitLabel, help, fieldSchema, options) {
		return new module.FormData(this.addOptionalDescriptions(this.makeSchema(psiType, fieldSchema)), this.makeRequestFields(psiType, this.extractFieldNames(fieldSchema), submitLabel, help, options), options);
	};

	/** Create schema and forms array for a generic form. Note that fieldSchema is stored without further modification. */
	module.makeFormData = function (submitLabel, help, fieldSchema, options) {
		return new module.FormData(this.addOptionalDescriptions(fieldSchema), this.makeFields(this.extractFieldNames(fieldSchema), submitLabel, help, options), options);
	};

	module.getSchemaWithURI = function (uri, schema) {
		if (this._isObjectSchema(schema)) {
			var result = _.clone(schema);
			result.properties = _.extend(new this.SchemaWithURI(uri), schema.properties);
			return result;
		} else {
			return _.extend( new this.SchemaWithURI(uri), schema );
		}
	};

	module.postprocessJSONFields = function (data, jsonFields) {
		var errors = null;
		_.each(this._asArray(jsonFields), function (key) {
			try {
				if (data[key]) {
					var evaluated = eval('(' + data[key] + ')');
					if (_.isFunction(evaluated)) throw new Error('Function values may not be defined');
					data[key] = evaluated;
				}
			} catch (e) {
				errors = errors || [];
				if (e.message === 'Unexpected token )' && ! data[key].match(/\)/))
					e.message = 'JSON structure is not closed'; //correct for having to wrap definition in parentheses
				errors.push( new module.ValidationError(key, e.message) );
			}
		});
		return errors;
	};

	module.ValidationError = function ValidationError(fieldName, error) {
		if ( !(this instanceof ValidationError) ) { throw new Error("Constructor called as a function"); }
		this.uri = this.attribute = fieldName;
		this.message = error;
	};

	/** Convenience function to transform a hash of field names and error messages into the format that json form uses, which it then sets on the given form. */
	module.displayErrors = function (jqForm, formDesc, errors) {
		jqForm.jsonFormErrors(_.map(errors, function (e, f) { return new module.ValidationError(f, e); }), formDesc);
	};

	/**
	 * If formOrFunction is a function then it is bound to the OK button of the
	 * dialog, otherwise it is assumed to be a form on which submit() is called
	 * when OK is clicked.
	 */
	module.DialogSettings = function DialogSettings(formOrFunction) {
		if ( !(this instanceof DialogSettings) ) { throw new Error("Constructor called as a function"); }
		this.autoOpen = false;
		this.modal = true;
		this.width = 'auto';
		this.buttons = {
			OK: (_.isFunction(formOrFunction) ? formOrFunction : (function () { formOrFunction.submit(); /* Note that submit handler is responsible for closing dialog, since data validation may prevent this. */}) ),
			//FIXME Allow this to save values in dialog form... is that even (easily) achievable?
			Cancel: function () { $(this).dialog('close'); }
		};
	};

	/** Adapted from http://www.scottklarr.com/topic/425/how-to-insert-text-into-a-textarea-where-the-cursor-is/ */
	module.insertTextAtCaret = function (jsTextarea, text) {
		var scrollPos = jsTextarea.scrollTop;
		var strPos = 0;
		var br = ((jsTextarea.selectionStart || jsTextarea.selectionStart == '0') ? "ff" : (document.selection ? "ie" : false ) );
		if (br == "ie") { 
			jsTextarea.focus();
			var range = document.selection.createRange();
			range.moveStart ('character', -jsTextarea.value.length);
			strPos = range.text.length;
		} else if (br == "ff")
			strPos = jsTextarea.selectionStart;
	
		var front = (jsTextarea.value).substring(0,strPos);  
		var back = (jsTextarea.value).substring(strPos,jsTextarea.value.length); 
		jsTextarea.value=front+text+back;
		strPos = strPos + text.length;
		if (br == "ie") { 
			jsTextarea.focus();
			var range = document.selection.createRange();
			range.moveStart ('character', -jsTextarea.value.length);
			range.moveStart ('character', strPos);
			range.moveEnd ('character', 0);
			range.select();
		} else if (br == "ff") {
			jsTextarea.selectionStart = strPos;
			jsTextarea.selectionEnd = strPos;
			jsTextarea.focus();
		}
		jsTextarea.scrollTop = scrollPos;
	};

	return module;
});
