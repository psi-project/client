// Require.js configuration for PSI apps

requirejs.config({
	baseUrl: 'js',
	paths: {
		'backbone':				'//cdnjs.cloudflare.com/ajax/libs/backbone.js/1.0.0/backbone-min',
		//Local copy is version 1.1.6, some of whose fixes since 1.1.0 are probably worth having		
		'localstorage':			'lib/backbone.localStorage-min',
//		'localstorage':			'//cdnjs.cloudflare.com/ajax/libs/backbone-localstorage.js/1.1.0/backbone.localStorage-min',
		'bncconnector':			'lib/BNCConnector-compr',
		'date':					'//cdnjs.cloudflare.com/ajax/libs/datejs/1.0/date.min',
    	'highcharts':		 	'//code.highcharts.com/highcharts',
		'highcharts-more':		'//code.highcharts.com/highcharts-more',
    	'highcharts-export':	'//code.highcharts.com/modules/exporting',
		'jquery': 				'//ajax.googleapis.com/ajax/libs/jquery/2.0.0/jquery.min',
		'jquery-ui': 			'//code.jquery.com/ui/1.10.3/jquery-ui.min',
		//jsTree only behaves correctly when using the tzuryby version (0.8+) rather than the jeresig version (0.8) available in CDNs
		'jquery.hotkeys':		'lib/jquery.hotkeys',
		'jquery.jstree':		'//cdn.jsdelivr.net/jquery.jstree/pre1.0/jquery.jstree',
		'jsonform':				'lib/jsonform/jsonform',
		'jsv':					'lib/jsonform/jsv',
		'text':					'//cdnjs.cloudflare.com/ajax/libs/require-text/2.0.10/text',
		'underscore':			'//cdnjs.cloudflare.com/ajax/libs/underscore.js/1.5.2/underscore-min'
	},
	shim: {
		'backbone': {
			deps: ['underscore', 'jquery'],
			exports: 'Backbone'
		},
        'localstorage': {
            deps: ['backbone'],
            exports: 'Backbone.localStorage',
        },
		'underscore':			{ exports: '_' },
		'bnconnector':			{ exports: 'BNCConnector' },
		'jquery-ui':			['jquery'],
		'jquery.hotkeys':		['jquery'], 
		'jquery.jstree':		['jquery','jquery.hotkeys'],
		'highcharts': {
			deps: ['jquery'],
			exports: 'Highcharts'
		},
		'highcharts-more':		['highcharts'],
		'highcharts-export':	['highcharts'],
		'jsv':					{ exports: 'JSV' },
		'tv4_as_jsv':			{ exports: 'tv4_as_jsv' },
		'jsonform':				['jquery','jsv','tv4_as_jsv']
	}

});
