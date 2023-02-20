'use strict';

const Color = require('color');
const _http_base = require('homebridge-http-base');
const Cache = _http_base.Cache;

let Characteristic, Service, api;

module.exports = function(homebridge){
    Service = homebridge.hap.Service;
    Characteristic = homebridge.hap.Characteristic;
    api = homebridge;

    homebridge.registerAccessory('homebridge-magichome2', 'MagicHome2', MagicHomeAccessory);
};

class MagicHomeAccessory {

    constructor(log, config, api) {
        this.log = log;
        this.config = config;
        this.name = config.name || 'LED Controller';
        this.setup = config.setup || 'RGBW';
        this.port = config.port || 5577;
        this.ip = config.ip;
        this.purewhite = config.purewhite || false;
        this.singleChannel = config.singleChannel || false;

        this.settings = {
            on: false,
            color: Color.hsv([0, 0, 100]),
        };
        this.cacheTime = 500;
        this.statusCache = new Cache(this.cacheTime, 0);
        this.colorCache = new Cache(this.cacheTime, 0);

        this.getState();
        this.statusCache.queried();

        const informationService = new Service.AccessoryInformation();

        informationService
            .setCharacteristic(Characteristic.Manufacturer, 'MagicHome')
            .setCharacteristic(Characteristic.Model, 'LED-controller')
            .setCharacteristic(Characteristic.SerialNumber, '123456789');

        const lightbulbService = new Service.Lightbulb(this.name);
        
        lightbulbService
            .getCharacteristic(Characteristic.On)
            .onSet(this.setPowerState.bind(this))
            .onGet(this.getPowerState.bind(this));
        
        lightbulbService
            .addCharacteristic(new Characteristic.Brightness())
            .onSet(this.setBrightness.bind(this))
            .onGet(this.getBrightness.bind(this));

        if (this.singleChannel == false) {
            lightbulbService
                .addCharacteristic(new Characteristic.Hue())
                .onSet(this.setHue.bind(this))
                .onGet(this.getHue.bind(this));

            lightbulbService
                .addCharacteristic(new Characteristic.Saturation())
                .onSet(this.setSaturation.bind(this))
                .onGet(this.getSaturation.bind(this));
        }


        this.informationService = informationService;
        this.lightbulbService = lightbulbService;

    }
    
    getServices() {
        return [this.informationService, this.lightbulbService];
    }

    identify() {
        this.log("Identify");
    }

    async getPowerState() {
        
        if (this.statusCache.shouldQuery()) {
            await this.getState();
            this.statusCache.queried();
        }
        
        return this.settings.on;
    }

    setPowerState(value) {
        this.log("setPowerState: " + (value ? "ON" : "OFF"));
        if (this.statusCache.shouldQuery() || (this.settings.on != value) ) {
            this.sendCommand(value ? '--on' : '--off');
        }
        this.settings.on = (value ? true : false);
    }

    async getBrightness() {
        var brightness;

        if (this.statusCache.shouldQuery()) {
            await this.getState();
            this.statusCache.queried();
        }

        if (this.singleChannel == true) {
            var color = this.settings.color;
            var curRgbValue = color.rgb().array()[0];
            brightness = Math.round( 41.55343 * Math.log10(curRgbValue + 0.03) );
        } else {
            brightness = this.settings.color.value();
        }

        return brightness;
    }

    setBrightness(value) {
        this.log("setBrightness: %s", value);
        var settings = this.settings;
        if (this.singleChannel == true) {
            var valueToRgb = Math.round( 10 ** (0.024064 * value ) );
            settings.color = Color.rgb([valueToRgb, valueToRgb, valueToRgb]);
        } else {
            settings.color = Color(settings.color).value(value);
        }
        this.setState(settings);
    }

    async getHue() {

        if (this.statusCache.shouldQuery()) {
            await this.getState();
            this.statusCache.queried();
        }

        return this.settings.color.hue();
    }

    setHue(value) {
        this.log("setHue: %d", value);
        var settings = this.settings;
        settings.color = Color(settings.color).hue(value);
        this.setState(settings);
    }

    async getSaturation() {
        if (this.statusCache.shouldQuery()) {
            await this.getState();
            this.statusCache.queried();
        }
        
        return this.settings.color.saturationv();
    }

    setSaturation(value) {
        this.log("setSaturation: %s", value);
        var settings = this.settings;
        settings.color = Color(settings.color).saturationv(value);
        this.setState(settings);
    }

    async sendCommand(command) {
        const exec = require('child_process').exec;
        const execPromise = require('util').promisify(exec);
        var cmd =  'flux_led ' + this.ip + ' ' + command;
        var {stdout, stderr} = await execPromise(cmd);
        //this.log("sendCommand out: %s", stdout);
        return await stdout;
    }

    async getState() {
        var out = await this.sendCommand('-i')
        var settings = this.settings;

        var colors = out.match(/\(\d{1,3}\, \d{1,3}, \d{1,3}\)/);
        var isOn = out.match(/\] ON /);

        if(isOn && isOn.length > 0)
            settings.on = true;
        else
            settings.on = false;

        if(colors && colors.length > 0) {
            settings.color = Color('rgb' + colors);
        }

        this.settings = settings;
    }

    async setState(settings) {
        var color = settings.color;
        var base;

        if(color.saturationv() == 0 && color.hue() == 0 && this.purewhite)
            base = '-w ' + Math.round(this.color.value());
        else
            base = '-c ' + color.rgb().round().array();
        
        this.sendCommand(base);
        this.settings = settings;
    }

}

