'use strict';

const Color = require('color');
const Cache = require('homebridge-http-base').Cache;
const runPython = require('nopy').spawnPython;
const FluxLed = __dirname + "/python_modules/bin/flux_led";

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
        this.cacheTime = 1000;
        this.statusCache = new Cache(this.cacheTime, 0);

        this.getState();

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

    getPowerState() {
        
        this.getState();
        return this.settings.on;
    }

    setPowerState(value) {
        if (this.statusCache.shouldQuery() || (this.settings.on != value) ) {
            this.log("set Power: " + (value ? "ON" : "OFF"));
            this.sendCommand(value ? '--on' : '--off');
        }
        this.settings.on = (value ? true : false);
    }

    getBrightness() {
        var brightness;

        this.getState();

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
        var settings = this.settings;
        if (this.singleChannel == true) {
            var valueToRgb = Math.round( 10 ** (0.024064 * value ) );
            settings.color = Color.rgb([valueToRgb, valueToRgb, valueToRgb]);
        } else {
            settings.color = Color(settings.color).value(value);
        }
        this.setState(settings);
    }

    getHue() {

        this.getState();
        return this.settings.color.hue();
    }

    setHue(value) {
        var settings = this.settings;
        settings.color = Color(settings.color).hue(value);
        this.setState(settings);
    }

    getSaturation() {
        this.getState();
        return this.settings.color.saturationv();
    }

    setSaturation(value) {
        var settings = this.settings;
        settings.color = Color(settings.color).saturationv(value);
        this.setState(settings);
    }

    async sendCommand(command) {
        var out = "";
        out = await runPython([FluxLed, this.ip, command], {interop: "buffer"}).then(( {code, stdout, stderr}) => {
            return stdout;
        }).catch(error => {
            this.log(stderr)
        });
        //this.log("STDOUT: %s", out);
        return out;
    }

    async getState() {
        if (this.statusCache.shouldQuery()) {
            var out = await this.sendCommand('-i');
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
            this.statusCache.queried();
        }
    }

    async setState(settings) {
        this.log("set Color: %s", settings.color.rgb());
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

