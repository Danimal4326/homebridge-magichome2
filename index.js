'use strict';

var Color = require('color');

var Characteristic, Service;

module.exports = function(homebridge){
    Service = homebridge.hap.Service;
    Characteristic = homebridge.hap.Characteristic;

    homebridge.registerAccessory('homebridge-magichome', 'MagicHome', MagicHomeAccessory, false);
};

function MagicHomeAccessory(log, config, api) {

    this.log = log;
    this.config = config;
    this.name = config.name || 'LED Controller';
    this.setup = config.setup || 'RGBW';
    this.port = config.port || 5577;
    this.ip = config.ip;
    this.color = Color.hsv([0, 0, 100]);
    this.purewhite = config.purewhite || false;
    this.singleChannel = config.singleChannel || false;

    this.getColorFromDevice();

}

MagicHomeAccessory.prototype.identify = function(callback) {
    callback();
};

MagicHomeAccessory.prototype.getServices = function() {
    var informationService = new Service.AccessoryInformation();

    informationService
        .setCharacteristic(Characteristic.Manufacturer, 'MagicHome')
        .setCharacteristic(Characteristic.Model, 'LED-controller')
        .setCharacteristic(Characteristic.SerialNumber, '123456789');

    var lightbulbService = new Service.Lightbulb(this.name);

    lightbulbService
        .getCharacteristic(Characteristic.On)
        .on('get', this.getPowerState.bind(this))
        .on('set', this.setPowerState.bind(this));

    lightbulbService
        .addCharacteristic(new Characteristic.Brightness())
        .on('get', this.getBrightness.bind(this))
        .on('set', this.setBrightness.bind(this));

    if (this.singleChannel == false) {
        lightbulbService
            .addCharacteristic(new Characteristic.Hue())
            .on('get', this.getHue.bind(this))
            .on('set', this.setHue.bind(this));

        lightbulbService
            .addCharacteristic(new Characteristic.Saturation())
            .on('get', this.getSaturation.bind(this))
            .on('set', this.setSaturation.bind(this));
    };

        return [informationService, lightbulbService];

};

// UTIL

MagicHomeAccessory.prototype.sendCommand = function(command, callback) {
    var exec = require('child_process').exec;
    //var cmd =  __dirname + '/flux_led.py ' + this.ip + ' ' + command + ' -v';
    var cmd =  __dirname + '/flux_led.py ' + this.ip + ' ' + command;
    exec(cmd, function(err, stdout, stderr) {
        if (err)
        callback(true, stderr);
        else
        callback(false, stdout);
    });
};

MagicHomeAccessory.prototype.getState = function (callback) {
    this.sendCommand('-i', function(error, stdout) {
        var settings = {
            on: false,
            color: Color.hsv([0, 0, 100])
        };

        var colors = stdout.match(/\(\d{1,3}\, \d{1,3}, \d{1,3}\)/g);
        var isOn = stdout.match(/\] ON /g);
        
        if(isOn && isOn.length > 0) settings.on = true;
        if(colors && colors.length > 0) {
           settings.color = Color('rgb' + colors);
        }

        callback(settings);

    });
};

MagicHomeAccessory.prototype.getColorFromDevice = function() {
    this.getState(function(settings) {
        this.color = settings.color;
    }.bind(this));
};

MagicHomeAccessory.prototype.setToCurrentColor = function(callback) {
    var color = this.color;

    if(color.saturationv() == 0 && color.hue() == 0 && this.purewhite) {
        this.setToWarmWhite(callback);
        return
    }

    var base = '-x ' + this.setup + ' -c ' + color.rgb().round().array();
    this.sendCommand(base, function() {
        callback();
    });
    this.log("Set Color to: %s", color.rgb().round().array());
};

MagicHomeAccessory.prototype.setToWarmWhite = function(callback) {
    var brightness = Math.round(this.color.value());
    this.sendCommand('-w ', function() {
        callback();
    });
};

// POWERSTATE

MagicHomeAccessory.prototype.getPowerState = function(callback) {
    this.getState(function(settings) {
        callback(null, settings.on);
    });
};

MagicHomeAccessory.prototype.setPowerState = function(value, callback) {
    this.log("Set power: " + (value ? "ON" : "OFF"));
    this.sendCommand(value ? '--on' : '--off', function() {
        callback();
    });
};

// HUE

MagicHomeAccessory.prototype.getHue = function(callback) {
    this.getColorFromDevice();
    callback(null, this.color.hue());
};

MagicHomeAccessory.prototype.setHue = function(value, callback) {
    this.color = Color(this.color).hue(value);
    this.setToCurrentColor(callback);
    //callback();
};

// SATURATION

MagicHomeAccessory.prototype.getSaturation = function(callback) {
    this.getColorFromDevice();
    callback(null, this.color.saturationv());
};

MagicHomeAccessory.prototype.setSaturation = function(value, callback) {
    this.color = Color(this.color).saturationv(value);
    this.setToCurrentColor(callback);
    //callback();
};

// BRIGHTNESS

MagicHomeAccessory.prototype.getBrightness = function(callback) {
    this.getColorFromDevice();
    if (this.singleChannel == true) {
        var curRgbValue = this.color.rgb().array()[0];
        var rgbToValue = Math.round( 41.55343 * Math.log10(curRgbValue + 0.03) );
        callback(null, rgbToValue);
    } else {
        callback(null, this.color.value());
    }
};

MagicHomeAccessory.prototype.setBrightness = function(value, callback) {
    if (this.singleChannel == true) {
        var valueToRgb = Math.round( 10 ** (0.024064 * value ) );
        this.color = Color.rgb([valueToRgb, valueToRgb, valueToRgb]);
    } else {
        this.color = Color(this.color).value(value);
    }
    this.log("Set Brightness to: %s", value);
    this.setToCurrentColor(callback);
    //callback();
};
