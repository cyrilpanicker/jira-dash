var request = require('request');
var Promise = require('bluebird');
var config=require('./JQLConfig.json');
var sample = require('./out.json');

var milliSecsInADay = 86400000;

var allJiraQuery = "Project = SG AND Type = Bug AND 'Defect Environment' = Production AND Status not in (Resolved, Verified, Closed) AND assignee in (USP_SAL_IRS_SUPPORT, USP_UC_UP_SUPPORT, ShopSears_Support, MobileAppSupport, danand1, mmohan1, aatla0, bsingh6, PTHANKA, amuthiy, RDEV1, rasthan, bdutta0, MKUMAR5, rveedu, abaner2, DPANT, ddevara, rmeena, abhatt1, skandiy, akalimu, gsundha, mmohan2, pmancha, srajesw, ntreesa, pwilso4, smishr0, amanog0, Kpalan0, srajama, schand3, vmuthus, nmathe1, kramakr, rjacob0, rthanka, vvenka2, rthanka, ssiraju, nthom18, aabrah8, vmeruva) AND ('Sub Project' in ('ShopSears 2.5', 'ShopSears2.5', 'ShopSears 2.5_Lite', 'Production Defects') OR 'Sub Project' in ('ShopSears 2.0', 'ShopSears Lite_UC', 'ShopSears 2.5', 'ShopSears2.5', 'ShopSears 2.5_Lite', 'Production Defects', 'Mobile 6.x', 'Core Mobile Services', 'Service Abstraction Layer', FindItCenter, 'In Store Kiosk') AND component in (USP_VAULT, USP_URS, USP_UAS, USP_SAL, USP_UC, USP_UPAS, USP_OMS, 'Print Receipt', USP_UP, USP_PV, USP_SAL_Cart, USP_Shipping, RDM, USP_IRS))";
var team = ['USP_SAL_IRS_SUPPORT','USP_UC_UP_SUPPORT','ShopSears_Support','MobileAppSupport','danand1','mmohan1','aatla0','bsingh6','PTHANKA','amuthiy','RDEV1','rasthan','bdutta0','MKUMAR5','rveedu','abaner2','DPANT','ddevara','rmeena','abhatt1','skandiy','akalimu','gsundha','mmohan2','pmancha','srajesw','ntreesa','pwilso4','smishr0','amanog0','Kpalan0','srajama','schand3','vmuthus','nmathe1','kramakr','rjacob0','rthanka','vvenka2','rthanka','ssiraju','nthom18','aabrah8','vmeruva'];
var orderByClause = ' ORDER BY priority DESC, createdDate ASC';

var getJiraCount = function () {
	return new Promise(function (resolve,reject) {
		request({
			method:'GET',
			useQuerystring:true,
			uri:'https://obujira.searshc.com/jira/rest/api/2/search',
			qs:{
				fields:["key"],
				startAt:0,
				maxResults:1,
				jql:config.priorityClause + allJiraQuery + orderByClause
			}
		},function (error,response,body) {
			if (error) {
				reject(error);
			} else {
				resolve(JSON.parse(body).total);
			}
		});
	});
};

var getJiras = function (options) {
	return new Promise(function (resolve,reject) {
		request({
			method:'GET',
			useQuerystring:true,
			uri:'https://obujira.searshc.com/jira/rest/api/2/search',
			qs:{
				fields:["key","summary","priority","assignee","status","created","customfield_10143","components","labels","customfield_10024","comment"],
				startAt:(options && options.startAt) || 0,
				maxResults:(options && options.maxResults) || 1,
				jql:config.priorityClause + allJiraQuery + orderByClause,
				expand:'changelog'
			}
		},function (error,response,body) {
			if (error) {
				reject(error);
			} else {
				resolve(JSON.parse(body).issues);
			}
		});
	});
};

var getAllJiras = function () {

	var batchSize = 50;
	var turns;
	var startAt = 0;
	var _jiras = [];
	var jiras = [];
	var jirasFetchedPromise;
	var allJirasFetchedPromise = [];

	return getJiraCount()
	.then(function(count){
		return Promise.resolve(count);
	},function(errorResponse){
		return Promise.reject(errorResponse);
	})
	.then(function(count){
		turns = Math.ceil(count / batchSize);
		for (var i = 0; i < turns; i++) {
			(function (i) {
				jirasFetchedPromise = getJiras({startAt:startAt, maxResults:batchSize})
				.then(function(issues){
					_jiras[i] = issues;
				},function(errorResponse){
					return Promise.reject(errorResponse);
				});
				allJirasFetchedPromise.push(jirasFetchedPromise);
				startAt += batchSize;
			})(i);
		};
		return Promise.all(allJirasFetchedPromise);
	},function(errorResponse){
		return Promise.reject(errorResponse);
	}).then(function(response){
		for (var i = 0; i < _jiras.length; i++) {
			jiras = jiras.concat(_jiras[i]);
		};
		return Promise.resolve(jiras);
	},function(errorResponse){
		return Promise.reject(errorResponse);
	});
};

var getTestJiras = function() {
	return new Promise(function (resolve,reject) {
		resolve(sample.issues);
	});
};

var processList = function (list) {
	var processedList = [];

	for (var i = 0; i < list.length; i++) {

		var created='', assigned='', lastWorked='';
		processedList[i] = {};

		//id, summary, status, eta, sub-project
		processedList[i].id = list[i].key;
		processedList[i].summary = list[i].fields.summary;
		processedList[i].status = list[i].fields.status.name;
		processedList[i].eta = list[i].fields.customfield_10143;
		processedList[i].subProject = list[i].fields.customfield_10024.value;

		//created
		created = new Date(Date.parse(list[i].fields.created));
		processedList[i].created = created.toLocaleString();

		//priority
		for (var j = list[i].fields.labels.length - 1; j >= 0; j--) {
			if (list[i].fields.labels[j] == 'Business_Priority') {
				processedList[i].priority = 'BP';
				break;
			};
		};
		if (!processedList[i].priority) {
			processedList[i].priority = list[i].fields.priority.name;
		};

		//assignee
		processedList[i].assignee = {};
		processedList[i].assignee.name = list[i].fields.assignee.displayName;
		processedList[i].assignee.userName = list[i].fields.assignee.name;

		//components
		processedList[i].components = [];
		for (var j = 0; j < list[i].fields.components.length; j++) {
			processedList[i].components.push(list[i].fields.components[j].name);
		};


		//assigned
		assignedLoop :
		for (var j = 0; j < list[i].changelog.histories.length; j++) {
			for (var k = list[i].changelog.histories[j].items.length - 1; k >= 0; k--) {
				if (list[i].changelog.histories[j].items[k].field == 'assignee') {
					for (var l = team.length - 1; l >= 0; l--) {
						if (list[i].changelog.histories[j].items[k].to && list[i].changelog.histories[j].items[k].to.toUpperCase().indexOf(team[l].toUpperCase()) > -1) {
							assigned = new Date(Date.parse(list[i].changelog.histories[j].created));
							break assignedLoop;
						};
					};
				};
			};
		};
		if (!assigned) {
			assigned = created;
		};
		processedList[i].assigned = assigned.toLocaleString();


		//last-worked
		lastWorkedLoop : 
		for (var j = list[i].fields.comment.comments.length - 1; j >= 0; j--) {
			for (var k = team.length - 1; k >= 0; k--) {
				if (list[i].fields.comment.comments[j].author.name.toUpperCase().indexOf(team[k].toUpperCase()) > -1) {
					lastWorked = new Date(Date.parse(list[i].fields.comment.comments[j].created));
					break lastWorkedLoop;
				};
			};
		};
		if (!lastWorked) {
			lastWorked = assigned;
		};
		processedList[i].lastWorked = lastWorked.toLocaleString();

		//daysSinceLastWorked
		processedList[i].daysSinceLastWorked = Math.floor(((new Date()).getTime() - lastWorked.getTime())/86400000);

		//comments
		processedList[i].comments = [];
		for (var j = 0; j < list[i].fields.comment.comments.length; j++) {
			processedList[i].comments.push({
				author : list[i].fields.comment.comments[j].author.displayName,
				date : new Date(Date.parse(list[i].fields.comment.comments[j].created)).toLocaleString(),
				text : list[i].fields.comment.comments[j].body
			});
		};

	};
	return processedList;
};

module.exports={
	getJiraCount:getJiraCount,
	getJiras:getJiras,
	getAllJiras:getAllJiras,
	processList:processList,
	getTestJiras:getTestJiras
};