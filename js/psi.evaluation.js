/*
 * PSI Evaluation module 0.6
 * 
 * Author: James Montgomery (james.montgomery at anu.edu.au)
 * 
 * Developed as part of the Protocols and Structures for Inference project: http://psi.cecs.anu.edu.au
 */

define(['jquery','underscore','backbone','highcharts','psi.table','highcharts-more','highcharts-export'], function($, _, Backbone, Highcharts, dataTable) {
	var module = {};

	var JoinRequest = module.JoinRequest = function JoinRequest(predictorURI, explanation) {
		if ( !(this instanceof JoinRequest) ) throw new Error("Constructor called as a function");
		this.psiType = 'composition';
		this.join = predictorURI;
		this.description = explanation; //if joins are persisted on server then really am explaining why this was created, rather than describing it
	};
	
	var Result = module.Result = function Result(loss) {
		if ( !(this instanceof Result) ) throw new Error("Constructor called as a function");
		this.loss = loss;
		this.errorName = loss.name;
		//TODO Add more metrics/detail as more complex evaluation metrics are added
	};
	Result.prototype.reviseLoss = function(testData, predData) {
		this.lossValue = _.isUndefined(this.lossValue) ? this.loss.calculate(testData, predData) : this.lossValue;
		return this.lossValue;
	};
	Result.prototype.getSimpleMetrics = function() { return [ { name: 'Loss (' + this.errorName + ')', value: this.reviseLoss() } ]; };
	Result.prototype.supportedCharts = function() { return []; };
	Result.prototype.getSeriesData = function(chartName) { return null; };
	Result.prototype.getChartCategories = function(chartName) { return []; };
	/** Returns an object that may contain y-axis min and max, value prefixes and suffixes, to be used by Highcharts. */
	Result.prototype.getChartConstraints = function(chartName) { return {}; };
	
	var Loss = module.Loss = function Loss(name, l, summarizer) {
		if ( !(this instanceof Loss) ) throw new Error("Constructor called as a function");
		this.name = name;
		this.l = l;
		this.summarizer = _.isUndefined(summarizer) ? _.identity : summarizer;
		this._sumLosses = function(x,y) {
			return _.reduce( _.zip(x,y), function(s,xy) { return s + l(xy[0],xy[1]); }, 0);
		};
		this.calculate = _.compose(this.summarizer, this._sumLosses);
	};
	
	module.Loss.classification = new Loss("error", function(x,y) { return x === y ? 0 : 1; });
	
	module.Loss.regression = new Loss("sum squared error", function(x,y) { return Math.pow(x - y, 2); });
	
	//More general evaluation of predictor performance, beyond simple losses
	
	module.ClassificationResult = function ClassificationResult(testData, predData) {
		if ( !(this instanceof ClassificationResult) ) throw new Error("Constructor called as a function");
		this.reviseLoss(testData, predData);
		//Determine nominal labels and map from labels to integer indices
		this.labels = _.uniq(testData);
		this.labelToIndex = { };
		for (var i = 0; i < this.labels.length; i++)
			this.labelToIndex[this.labels[i]] = i;
		//Generate confusion matrix
		this.confusionMatrix = _.map(this.labels, function() { return _.map(this.labels, function() { return 0; }); }, this);
		for (i in testData)
			this.confusionMatrix[ this.labelToIndex[testData[i]] ][ this.labelToIndex[predData[i]] ]++;
		//Calculate derived metrics: precision, recall, etc.
		this.precision = _.map(this.labels, function() { return 0; });
		this.recall = _.map(this.labels, function() { return 0; });
		var tp = [];
		for (t in this.confusionMatrix) {
			tp[t] = this.confusionMatrix[t][t];
			for (p in this.confusionMatrix[t]) {
				this.precision[p] += this.confusionMatrix[t][p];
				this.recall[t] += this.confusionMatrix[t][p];
			}
		}
		for (i in this.precision) {
			this.precision[i] = Math.round(tp[i] / this.precision[i] * 1000) / 10; 
			this.recall[i] = Math.round(tp[i] / this.recall[i] * 1000) / 10;
		}
		this.chartData = { precision: this.precision, recall: this.recall };
		this.avgPrecision = _.reduce(this.precision, function(s,v) { return s+v; }, 0) / this.precision.length;
		this.avgRecall = _.reduce(this.recall, function(s,v) { return s+v; }, 0) / this.recall.length;
	
		this.getSimpleMetrics = function() {
			var metrics = Result.prototype.getSimpleMetrics.call(this)
				.concat( [ { name: 'Avg precision (%)', value: this.avgPrecision }, { name: 'Avg recall (%)', value: this.avgRecall } ] );
			return metrics;
		};

		this.supportedCharts = function() { return _.keys(this.chartData); };

		this.getSeriesData = function(chartName) { return this.chartData[chartName]; };
		/** Categories (labels) are the same across all supported charts. */
		this.getChartCategories = function(chartName) { return this.labels; };

		this.getChartConstraints = function(chartName) { return { min: 0, max: 100, valueSuffix: '%'  }; };
	};

	module.ClassificationResult.prototype = new module.Result(module.Loss.classification);
	
	module.RegressionResult = function RegressionResult(testData, predData) {
		if ( !(this instanceof RegressionResult) ) throw new Error("Constructor called as a function");
		this.reviseLoss(testData, predData);
		//Any other meaningful metrics to calculate and add?
	};
	module.RegressionResult.prototype = new module.Result(module.Loss.regression);
	
	module.AJAXPOST = function AJAXPOST(uri, request) {
		if ( !(this instanceof AJAXPOST) ) throw new Error("Constructor called as a function");
		this.type = 'POST';
		this.url = uri;
		this.data = JSON.stringify(request);
		this.dataType = 'json';
		this.contentType = 'application/json';
		this.processData = false;
	};
	
	module.PredictionTester = function PredictionTester(options) {
		if ( !(this instanceof PredictionTester) ) throw new Error("Constructor called as a function");
		//Event labels
		this.START = "STARTED";
		this.PROGRESS = "PROGRESS";
		for (i in options)
			if (_.isString(options[i])) options[i] = options[i].trim();
		_.extend(this, options);
		_.extend(this, Backbone.Events); 
	};

	module.PredictionTester.prototype._getResource = function(uri, failMsgFunction) {
		var retrieved = this.retrieved || (this.retrieved = {});
		if (_.isUndefined(retrieved[uri]))
			retrieved[uri] = $.get(uri).success(function(data) { retrieved[uri] = data; });
		return $.when( retrieved[uri] )
			.fail( function(jqXHR,status,error) {
				validator.showProgress( failMsgFunction ? failMsgFunction(jqXHR,status,error) : 'Error getting representation of ' + uri + ': ' + error + '. Server response: ' + jqXHR.responseText());
			});
	};
	
	module.PredictionTester.prototype._summariseResults = function(results) {
		//FIXME Currently doesn't deal with results that failed; needs to be robust to server-side failures
		this.meanLoss = _.reduce( results, function(s,r) { return s + r.outcome.lossValue; }, 0) / this.predictors.length;
	};
	
	module.PredictionTester.prototype.postRequest = function(uri, req, callbacks) {
		return $.ajax(_.extend( new module.AJAXPOST(uri, req), callbacks));
	};
	
	module.PredictorComparator = function PredictorComparator(options) {
		if ( !(this instanceof PredictorComparator) ) throw new Error("Constructor called as a function");
		if (! (options.sourceAttribute && options.targetAttribute && options.predictors && _.isArray(options.predictors) && options.predictors.length))
			throw new Error("Predictor comparator requires source and target (i.e., label) attribute URIs as well as at least one predictor URI");
		this.superInit(options);
	};
	
	module.PredictorComparator.prototype = new module.PredictionTester;
	module.PredictorComparator.prototype.superInit = module.PredictionTester;
	module.PredictorComparator.prototype.constructor = module.PredictorComparator;

	module.PredictorComparator.prototype.reportProgress = function(message) {
		this.trigger(this.PROGRESS, message);
	};
	
	module.PredictorComparator.prototype.determineResultClass = function(attr) {
		//FIXME Expects certain predefined schema to be used; a more general solution is required
		var type = attr.emits;
		if (_.isObject(type)) //Assumes PSI schema shorthand, in which an object will contain a single key being the predefined schema name
			type = _.keys(type)[0];
		if (type === '$number')
			return module.RegressionResult;
		else if (type === '$string' && attr.emits[type]['enum'])
			return module.ClassificationResult;
		return null;
	};
	
	/** Returns the location of the joined attribute-predictor as a deferred result. */
	module.PredictorComparator.prototype.createPredictingAttribute = function(sourceURI, targetURI, predURI) {
		var validator = this;
		var deferred = new $.Deferred();
		
		var errorMsg = function(details) { return 'Error joining predictor ' + predURI + ' to source attribute: ' + details; };
		
		this.postRequest(sourceURI, new JoinRequest(predURI, 'Predicting value of ' + targetURI + ' from value of ' + sourceURI + ' using predictor at ' + predURI))
			.done( function(d,t,jqXHR) {
				var location = jqXHR.getResponseHeader('Location');
				if (location)
					deferred.resolve(location);
				else {
					validator.reportProgress(errorMsg('no location for join returned by server'));
					deferred.reject();
				}
			})
			.fail( function(jqXHR, textStatus, errorThrown) {
				validator.reportProgress(errorMsg(errorThrown + '. Reponse from server: ' + jqXHR.responseText));
				deferred.reject();
			});
		
		return deferred;
	};
	
	module.PredictorComparator.prototype.getAttributeValues = function(uri) {
		return this._getResource(uri + (/\?/.test(uri) ? '&' : '?') + 'instance=all');
	};
	
	module.PredictorComparator.prototype.run = function() {
		var validator = this;
		this.trigger(this.START);
		this.trigger(this.PROGRESS, 'Starting comparison of ' + this.predictors.length + ' predictors');
	
		var deferred = new $.Deferred();
		
		$.when( this._getResource(this.targetAttribute) ).done( function(attr) {
			validator.resultClass = validator.determineResultClass( attr );
			$.when( validator.getAttributeValues( validator.targetAttribute ) ).done( function(psiValue) {
				validator.testData = psiValue.valueList;
				var deferredResults = [];
				for (i in validator.predictors)
					deferredResults.push( validator.testOne({ predictor: validator.predictors[i], testData: validator.testData }) );
				$.when.apply($, deferredResults).done( function() {
					validator.results = _.map(_.filter(arguments, function(r) { return !_.isUndefined(r.outcome); } ), _.identity);
					validator._summariseResults(validator.results);
					validator.failedCount = arguments.length - validator.results.length;
					deferred.resolve(validator);
				} );
			} )
			.fail( function(jqXHR, textStatus, errorThrown) { validator.reportProgress('Error obtaining test data. Details: ' + jqXHR.responseText); } );
		} );
		return deferred;
	};
	
	module.PredictorComparator.prototype.testOne = function(result, deferred) {
		var validator = this;
		if (_.isUndefined(deferred))
			deferred = new $.Deferred();
	
		this.reportProgress('Retrieving predictions from ' + result.predictor);
		
		//Even fail cases are handled by resolving the deferred result (which
		// will simply not contain a test outcome), since failing _one_ test
		// should not cause other tests to have appeared to fail.
		$.when( this.createPredictingAttribute(this.sourceAttribute, this.targetAttribute, result.predictor) )
			.done( function(uri) {
				//Provides a more appropriate error message than _getResource's generic one, as well as rejecting the deferred result
				var failHandler = function(jqXHR, textStatus, errorThrown) {
					validator.reportProgress('Error obtaining predictions. Cannot complete testing ' + result.predictor + '. Details: ' + jqXHR.responseText);
					deferred.resolve(result);
				};
				validator.getAttributeValues(uri, failHandler)
					.done( function(psiValue) {
						result.predictions = psiValue.valueList;
						validator.reportProgress('Completed testing of ' + result.predictor);
						result.outcome = new validator.resultClass(result.testData, result.predictions);
						//FIXME Need a better way to obtain this information
						validator.lossName = validator.lossName || result.outcome.errorName;
						deferred.resolve(result);
					});
			})
			.fail( function() { deferred.resolve(result); } );
		return deferred;
	};

	module.PredictorComparator.prototype.getChartCount = function() { return this.results[0].outcome.supportedCharts().length; };
	module.PredictorComparator.prototype.generateCharts = function($div) {
		var aResult = this.results[0].outcome;
		var chartTypes = aResult.supportedCharts();
		var chartDivs = _.map(chartTypes, function() { return $('<div class="reportChart">'); });
		$div.append.apply($div, chartDivs);
		_.each(_.zip(chartDivs, chartTypes), function(p) { return this.generateChart(p[0], p[1], aResult.getChartCategories(name), aResult.getChartConstraints()); }, this);
	};
	module.PredictorComparator.prototype.generateChart = function($div, chartName, categories, constraints) {
		//TODO Based on structure/type of first result, generate appropriate charts
		var series = _.map(this.results, function(r) {
			return { name: r.predictor.substring(r.predictor.lastIndexOf('/')+1), data: r.outcome.getSeriesData(chartName) };
		});
		createSpiderwebChart($div, chartName, categories, series, constraints);
		$div.css('display', 'inline-block');
	};
	
	module.ConfusionMatrixDisplay = function ConfusionMatrixDisplay(clfResult, title) {
		if ( !(this instanceof ConfusionMatrixDisplay) ) throw new Error("Constructor called as a function");
		this.$el = $('<div class="confusionMatrix">');
		if (title) this.$el.append('<h4>' + title + '</h4>');
		
		var table = document.createElement('table');
		var header = table.createTHead();
		var row = header.insertRow(-1);
		row.appendChild( dataTable._th('', 2, 2) );
		row.appendChild( dataTable._th('Predictions', 1, clfResult.labels.length, 'heading top left right') );
		row = header.insertRow(-1);
		_.each(clfResult.labels, function(l) { row.appendChild( dataTable._th(l, 1, 1, 'classLabel') ); } );
		row.cells[0].className += ' left';
		row.cells[row.cells.length-1].className += ' right';
		var tbody = table.appendChild( document.createElement('tbody') );
		var nLabels = clfResult.labels.length;
		for (i in clfResult.labels) {
			row = tbody.insertRow(-1);
			if (i == 0) row.appendChild( dataTable._th('Labels', clfResult.labels.length, 1, 'heading top left bottom') );
			row.appendChild( dataTable._th(clfResult.labels[i], 1, 1, 'classLabel' + (i == nLabels - 1? ' bottom' : '')) );
			for (p in clfResult.labels) {
				var cell = row.insertCell(-1);
				cell.className = (i == p ? 'tp' : 'fp') + (p == nLabels - 1? ' right' : '') + (i == nLabels - 1? ' bottom' : '');
				cell.innerHTML = clfResult.confusionMatrix[i][p];
				cell.style.textAlign = 'center';
			}
		}
		this.$el.append(table);
	};

	var createSpiderwebChart = module.createSpiderwebChart = function($target, title, categories, series, constraints) {
		_.each(series, function(s) { s.pointPlacement = 'on'; });
		constraints = constraints || {};
		_.defaults(constraints, { min: null, max: null, valuePrefix: null, valueSuffix: null }); 
		return new Highcharts.Chart({
			chart: { renderTo: $target[0], polar: true, type: 'line' },
			title: { text: title },
			pane: { size: '80%' },
			xAxis: { categories: categories, tickmarkPlacement: 'on', lineWidth: 0 },
		    yAxis: { gridLineInterpolation: 'polygon', lineWidth: 0, min: constraints.min, max: constraints.max },
			tooltip: { shared: true, valuePrefix: constraints.valuePrefix, valueSuffix: constraints.valueSuffix },
			legend: { align: 'bottom' },
			series: series	
		});
	};

	return module;

});
