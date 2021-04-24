const Twit = require('twit');
const moment = require('moment');

let credentials, config;
if (process.env._ == '/app/.heroku/node/bin/npm') {
	// Use Heroku Config Vars when running on Heroku
	credentials = {
		consumer_key: process.env.CONSUMER_KEY,
		consumer_secret: process.env.CONSUMER_SECRET,
		access_token: process.env.ACCESS_TOKEN,
		access_token_secret: process.env.ACCESS_TOKEN_SECRET,
	};
	config = {
		message1: process.env.MESSAGE_1,
		message2: process.env.MESSAGE_2,
		offset: parseInt(process.env.OFFSET, 10),
		query: process.env.QUERY,
		hour: parseInt(process.env.HOUR, 10),
		step_count: parseInt(process.env.STEP_COUNT, 10),
		search_limit: parseInt(process.env.SEARCH_LIMIT, 10),
	};
} else {
	credentials = require('./credentials.json');
	config = require('./config.json');
}

const DATE_FORMAT = 'dd MMM DD HH:mm:ss ZZ YYYY';
// step_count is in milliseconds
const STEP_MINUTES = Math.floor(config.step_count / 60000);

// Stolen from https://stackoverflow.com/questions/11887934/how-to-check-if-dst-daylight-saving-time-is-in-effect-and-if-so-the-offset/11888430#11888430
function getStdTimezoneOffset(d) {
	const jan = new Date(d.getFullYear(), 0, 1);
	const jul = new Date(d.getFullYear(), 6, 1);
	return Math.max(jan.getTimezoneOffset(), jul.getTimezoneOffset());
}

function dst() {
	const date = new Date();
	return date.getTimezoneOffset() < getStdTimezoneOffset(date) ? 1 : 0;
}

// Stolen from https://stackoverflow.com/questions/30003353/can-es6-template-literals-be-substituted-at-runtime-or-reused/37217166#37217166
function format(templateString, templateVars) {
	return new Function('return `' + templateString + '`;').call(templateVars);
}

const T = new Twit(credentials);

function step() {
	const date = new Date();
	const now = Date.now();
	if (date.getUTCHours() == config.hour - dst() && date.getUTCMinutes() < STEP_MINUTES) {
		T.post('statuses/update', { status: format(config.message1, { count: Math.floor(now / 86400000) - config.offset }) })
			.catch(err => console.error(err))
			.then(res => console.log(`Tweeted at ${res.data.created_at}: ${res.data.text}`));
	}
	T.get('search/tweets', { q: format(config.query, { date: moment().subtract(1, 'd').format('YYYY-MM-DD') }), count: config.search_limit })
		.catch(err => console.error(err))
		.then(res => {
			res.data.statuses
				.filter(t => moment(t.created_at, DATE_FORMAT).toDate().valueOf() > now - config.step_count)
				.forEach(tweet => {
					T.post('statuses/update', {
						in_reply_to_status_id: tweet.id_str,
						username: '@' + tweet.user.screen_name,
						status: config.message2,
					})
						.catch(error => console.error(error))
						.then(resp => console.log(`Tweeted at ${resp.data.created_at}: ${resp.data.text}`));
				});
		});
}

function start() {
	setInterval(step, config.step_count);
	step();
}

const time = moment();
const nextStep = moment().startOf('hour').minute(time.minutes() + STEP_MINUTES - time.minutes() % STEP_MINUTES).second(1);
setTimeout(start, nextStep.valueOf() - time.valueOf());
