'use strict'
/* global Homey, module */

////////////////////////
// Vars.
var path = require('path');
var request = require('request');
var extend = require('extend');
const api_url = 'https://api.honeywell.com';
const api_key = 'SAphhQuIdh2ZDnYuhhe9GYOEZK1idZVz';
const redirect_uri = 'https://callback.athom.com/oauth2/callback/';


////////////////////////
// Code

homey_devices_timer();	// Starting the devices update timer.

///////////////////////
// Functions

module.exports.capabilities = {
	target_temperature: {},
	measure_temperature: {},
	thermostat_mode: {}
}

module.exports.capabilities.target_temperature.get = function( device_data, callback ) {
	console.log("-module.exports.capabilities.target_temperature.get("+device_data.deviceID+')');
	var device_values = homey_device_get_data(device_data);
	console.log ('  Value: ' + device_values.target_temperature);
	callback( null, device_values.target_temperature);
}

module.exports.capabilities.target_temperature.set = function( device_data, temp, callback ) {
	console.log("+module.exports.capabilities.target_temperature.set("+device_data.deviceID+', '+temp+')');
	honeywell_set_API_data_temp(device_data, temp);
	homey_device_set_data(   device_data, 'target_temperature', temp);
	module.exports.realtime( device_data, 'target_temperature', temp);
	callback( null, temp);
}

module.exports.capabilities.measure_temperature.get = function( device_data, callback ) {
	console.log("-module.exports.capabilities.measure_temperature.get("+device_data.deviceID+')');
	var device_values = homey_device_get_data(device_data);
	console.log ('  Value: ' + device_values.measure_temperature);
	callback( null, device_values.measure_temperature);
}

module.exports.capabilities.thermostat_mode.get = function( device_data, callback ) {
	console.log("-module.exports.capabilities.thermostat_mode.get("+device_data.deviceID+')');
	var device_values = homey_device_get_data(device_data);
	console.log ('  Value: ' + device_values.thermostat_mode);
	callback( null, device_values.thermostat_mode);
}

module.exports.capabilities.thermostat_mode.set = function( device, mode, callback ) {
	console.log("+module.exports.capabilities.thermostat_mode.set("+device.deviceID+', ' + mode + ')');
    callback( null, 7 );
}

module.exports.init = function(devices, callback) {
	console.log ("Driver Initialized.");
	callback();
}

module.exports.deleted = function( device_data ) {
    // run when the user has deleted the device from Homey
	var old_devices = Homey.manager('settings').get('thermostats');
	var new_devices = [];
	if (old_devices){
		for (var i in old_devices){
			if (old_devices[i].data.deviceID !== device_data.deviceID){
				new_devices.push(old_devices[i]);
			}
		}
	Homey.manager('settings').set('thermostats', new_devices);
	}
}

module.exports.pair = function(socket) {
	Homey.log('Honeywell Lyric pairing...');
	Homey.log(' Requesting oauth2 redirection url via Athom Cloud...');
	Homey.manager('cloud').generateOAuth2Callback(
		api_url + '/oauth2/app/login?apikey=' + api_key + '&redirect_uri=' + redirect_uri + "&app=Homey%20Honeywell%20Lyric&state=1",
		function( err, url ){
			Homey.log(' Gor a oauth2 redirection url from Athom Cloud.');
			Homey.manager('settings').set('authentication_url', url);
		},
		function( err, code ) {
			if( err ) return console.error(err);
			console.log(' Got authorization code!', code);
			
			//Get access_toven and Refresh_token.
			request.post( api_url + '/oauth2/token', {
				headers: {
						'Authorization': 'U0FwaGhRdUlkaDJaRG5ZdWhoZTlHWU9FWksxaWRaVno6TDk1Rkt0UWdHODZjd0NDbA==',
						'Accept': 'application/json',
						'Content-Type': 'application/x-www-form-urlencoded'
					},
				form: {
					'code'			: code,
					'redirect_uri'	: redirect_uri,
					'grant_type'	: 'authorization_code'
				},
				json: true
			}, function( err, response, body ){
				if( err || body.error ) return emit( 'authorized', false );
				console.log (' access_token:' + body.access_token);
				console.log (' refresh_token:' + body.refresh_token);
				Homey.manager('settings').set('access_token', body.access_token);
				Homey.manager('settings').set('refresh_token', body.refresh_token);
				socket.emit('authenticated', code, function( err, result ){	console.log( result ) });
			});

		}
	);
	socket.on('get_url', function(data, callback) {
		var reply = Homey.manager('settings').get('authentication_url');
		console.log(' Report the oauth2 URL to frontend!');
		callback( null, reply );
		Homey.manager('settings').set('authentication_url', '');
	});
	socket.on('get_devices', function(data, callback) {
		console.log(" Getting devices using token: "+  Homey.manager('settings').get('access_token'))
		request.get( api_url + '/v2/locations?apikey=' + api_key, {
			headers: {'Authorization': 'Bearer ' + Homey.manager('settings').get('access_token'), 'Accept': 'application/json'}
		}, function( err, response, location_data ){
			var locations = JSON.parse(location_data);
			
			Homey.manager('settings').set('honeywell_locations', locations);
			for(var i in locations) {
				console.log(" Location " + locations[i].locationID + ": " + locations[i].name)
				var devices = [];
				for(var x in locations[i].devices) {
					console.log(" - Device: " + locations[i].devices[x].name + " " + locations[i].devices[x].deviceType + " " + locations[i].devices[x].deviceID)
					if (locations[i].devices[x].deviceType === 'Thermostat') {
						devices.push({name:locations[i].devices[x].name, data:{deviceID: locations[i].devices[x].deviceID, locationID: locations[i].locationID}});
					}
				}
				Homey.manager('settings').set('thermostats', devices);
				socket.emit('continue', null);
			}
		});
	});
	socket.on('list_devices', function(data, callback) {
		console.log(" socket.on('list_devices')");
		callback(null, Homey.manager('settings').get('thermostats'));
	});
	socket.on('disconnect', function(data, callback) {
		Homey.log("socket.on('disconnect'", arguments);
	});
};

function homey_device_get_data(device_data){
	var devices = Homey.manager('settings').get('thermostats');
	if (devices){
		for (var i in devices){
			if (devices[i].data.deviceID === device_data.deviceID){
				return devices[i];
			}
		}
	}
}
//homey_device_set_data( device_data, 'target_temperature', device.state.temp)
function homey_device_set_data(device_data, type, value){
	var devices = Homey.manager('settings').get('thermostats');
	if (devices){
		for (var i in devices){
			if (devices[i].data.deviceID === device_data.deviceID){
				devices[i][type] = value;
				Homey.manager('settings').set('thermostats', devices);
			}
		}
	}
}

function honeywell_devices_update_data (){
	var devices = Homey.manager('settings').get('thermostats');
	if (devices){
		for (var i in devices){
			devices[i].updated = (new Date());
			honeywell_get_API_data(devices[i].data.deviceID, devices[i].data.locationID, function(api_data){
				if (api_data.code && api_data.code === 401) {
					honeywell_refresh_API_token(function(status){
						if (status = true) { honeywell_devices_update_data (); }
					});
				} else if (typeof api_data.changeableValues !== 'undefined' && typeof api_data.changeableValues.heatSetpoint !== 'undefined' && typeof api_data.indoorTemperature !== 'undefined' && typeof api_data.changeableValues.heatCoolMode !== 'undefined') {
					console.log (' + Received new data for ' + devices[i].name + '(' + devices[i].data.deviceID + ')');
					console.log ('   - Heat Setpoint:    ' + api_data.changeableValues.heatSetpoint + ' °C');
					console.log ('   - Room Temperature: ' + api_data.indoorTemperature + ' °C');
					console.log ('   - Mode:             ' + api_data.changeableValues.heatCoolMode);
					console.log ('   - Outdoor Temp:     ' + api_data.outdoorTemperature + ' °C');
					console.log ('');

					console.log('===============================');
					console.log(JSON.stringify(api_data));
					console.log('===============================');

					if (devices[i].target_temperature  !== api_data.changeableValues.heatSetpoint) {module.exports.realtime( devices[i].data, 'target_temperature',     api_data.changeableValues.heatSetpoint);};
					if (devices[i].measure_temperature !== api_data.indoorTemperature)             {module.exports.realtime( devices[i].data, 'measure_temperature',    api_data.indoorTemperature);};
					if (devices[i].thermostat_mode     !== api_data.changeableValues.heatCoolMode) {module.exports.realtime( devices[i].data, 'thermostat_mode',        api_data.changeableValues.heatCoolMode);};
					if (devices[i].outdoorTemperature  !== api_data.outdoorTemperature)            {Homey.manager('flow').triggerDevice('outside_temp_change', {device: devices[i].data.deviceID, temp: api_data.outdoorTemperature});};
					
					devices[i].target_temperature 	= 	api_data.changeableValues.heatSetpoint;
					devices[i].measure_temperature 	= 	api_data.indoorTemperature;
					devices[i].thermostat_mode 		= 	api_data.changeableValues.heatCoolMode;
					devices[i].outdoorTemperature 	= 	api_data.outdoorTemperature;
					
					Homey.manager('settings').set('thermostats', devices);
				} else {
					console.log ('ERROR! Something went wrong. expected new device values but got:');
					console.log (api_data);
					console.log (' ');
				}
			});
		}
	}
}

function honeywell_get_API_data (deviceID, locationID, callback) {
	console.log("Getting new data through API...");
	request.get( api_url + '/v2/devices/thermostats/'+deviceID+'?apikey='+api_key+'&locationId='+locationID, {
		headers: {'Authorization': 'Bearer ' + Homey.manager('settings').get('access_token'), 'Accept': 'application/json'}
	}, function( err, response, device_data ){
		console.log(" Got a response from Honeywell API.");
		try {
			var _device_data = JSON.parse(device_data);
		} catch (err){
			console.log('[API ERROR]', err);
		}	
		callback(_device_data);
	});
}

function honeywell_set_API_data_temp (device_data, temp){
	var heatSetpoint = temp;
	var coolSetpoint = temp + 1;
	var content = ''
	if (device_data.deviceID.substr(0,3) === 'LCC'){ // Device Type and the way it needs to comunicate.
		content = '{"mode": "heat", "heatSetpoint": '+heatSetpoint+', "coolSetpoint": '+coolSetpoint+', "thermostatSetpointStatus": "TemporaryHold"}';
	} else if (device_data.deviceID.substr(0,3) === 'TCC'){
		content = '{"mode": "Cool",	"autoChangeoverActive": true,	"heatSetpoint": '+heatSetpoint+',	"coolSetpoint": '+coolSetpoint+'}'
	} else {
		content = '{"mode": "heat", "heatSetpoint": '+heatSetpoint+', "coolSetpoint": '+coolSetpoint+', "thermostatSetpointStatus": "TemporaryHold"}';
	}

	console.log (content);
	request.post( api_url + '/v2/devices/thermostats/' + device_data.deviceID + '?apikey='+api_key+'&locationId='+device_data.locationID, {
		headers: {'Authorization': 'Bearer ' + Homey.manager('settings').get('access_token'), 'Content-Type': 'application/json'},
		body: content
	}, function( err, response, body ){
		if( err || body.error ) {console.log('ERROR!' + err)};
		if(response.statusCode === 200){
			console.log ('Temperature set through API to ' + heatSetpoint);
		} else if (response.statusCode === 401) {
			honeywell_refresh_API_token(function(status){
				if (status = true) { honeywell_set_API_data_temp (device_data, temp); }
			});
		} else {
			console.log ('ERROR!  While setting temperature, the API reported ' + response.statusCode);
		}
	});
}

function honeywell_refresh_API_token (callback) {
	console.log("Updating API access token.");
	request.post( api_url + '/oauth2/token', {
		headers: {
			'Authorization': 	'U0FwaGhRdUlkaDJaRG5ZdWhoZTlHWU9FWksxaWRaVno6TDk1Rkt0UWdHODZjd0NDbA==',
			'Accept': 			'application/json',
			'Content-Type': 	'application/x-www-form-urlencoded'
		},
		form: {
			'grant_type': 		'refresh_token',
			'refresh_token':  	Homey.manager('settings').get('refresh_token')
		},
		json: true
	}, function( err, response, body ){
		try {
			if (body.access_token && body.refresh_token){
				console.log (' -> Got a new access_token.');
				Homey.manager('settings').set('access_token', body.access_token);
				Homey.manager('settings').set('refresh_token', body.refresh_token);
				callback(true)
			} else {
				console.log (' WARNING! Didn`t got a new acccess token!');
				callback(false)
			}
		} catch (err) {
			console.log (' ERROR! Didn`t got a new acccess token!');
			callback(false)
		}
	});
}

function homey_devices_timer (){
	honeywell_devices_update_data();
	setTimeout(homey_devices_timer, 300000);
}
//HoneywellAPISupport@honeywell.com