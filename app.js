"use strict";
var request = require('request');
var interval = null;
var coins = [];
var insight_update = false;
var insight_timestamp = 0;

function init() {
    update_coins();
    
    Homey.log("Homey cryptocurrency app ready!");
    start_timer();
}

function start_timer() {
    var refresh_interval = Homey.manager('settings').get('auto_refresh');
    
    if (typeof interval !== 'undefined' && typeof interval !== 'undefined') {
        clearInterval(interval); // clear running interval
        Homey.log('Cleared interval');
    }
    
    if (typeof refresh_interval == 'number' && refresh_interval > 0) {
        interval = setInterval(function () {
            update_coins();
            //Homey.log(coins);
        }, 60000 * refresh_interval);
        Homey.log("Started auto-interval ("+refresh_interval+" mins)");
    }
}

function update_coins() {
    request('https://api.coinmarketcap.com/v1/ticker/?convert=EUR&limit=10', function (error, response, body) {
        //callback(error, body);
        if (error) {
            Homey.log(error);
        } else {
            try {
                var jsonObject;
                jsonObject = JSON.parse(body);
                
                if (typeof jsonObject === 'object') {
                    for (var i in jsonObject) {
                        if (typeof jsonObject[i].id === 'string') {
                            coins[jsonObject[i].symbol] = jsonObject[i];
                            
                            if (jsonObject[i].symbol == 'BTC' && (jsonObject[i].last_updated > (insight_timestamp + 3600))) {
                                Homey.log('LOGGING INSIGHT');
                                insight_update = true;
                            }

                            if (insight_update) {
                                insight_data(jsonObject[i].symbol, parseFloat(jsonObject[i].market_cap_usd));
                            }
                            
                            var tokens = {
                                'name': jsonObject[i].name,
                                'symbol': jsonObject[i].symbol,
                                'rank': parseFloat(jsonObject[i].rank),
                                'price_usd': (parseFloat(jsonObject[i].price_usd).toFixed(2))/1,
                                'price_eur': (parseFloat(jsonObject[i].price_eur).toFixed(2))/1,
                                'market_cap_usd': (parseFloat(jsonObject[i].market_cap_usd).toFixed(2))/1,
                                'volume': parseFloat(jsonObject[i]["24h_volume_usd"]),
                                'percent_change': (parseFloat(jsonObject[i].percent_change_24h).toFixed(2))/1
                            };
                            
                            triggerFlow(tokens, jsonObject[i].symbol);
                            
                            Homey.log("Coin "+jsonObject[i].symbol+" updated");
                        }
                    }
                    
                    if (insight_update) {
                        insight_update = false;
                        insight_timestamp = jsonObject[0].last_updated;
                    }
                }
            } catch (exception) {
                Homey.log('JSON error: '+ body);
            } 
        }
    });
}

function triggerFlow(tokens, symbol) {
    Homey.manager('flow').trigger('coin_updated', tokens, symbol, function(err, result){
        if( err ) return Homey.error(err);
    }); 
}

function insight_data(symbol, market_cap) {
    Homey.manager('insights').getLog(symbol, function(err, result){
        if( err && err.message == "invalid_log") {
            Homey.log('Creating log for '+symbol);
            Homey.manager('insights').createLog(symbol, {
                label: {
                    en: symbol+' Market Cap'
                },
                type: 'number',
                units: {
                    en: 'USD'
                },
                decimals: 2,
                chart: 'line' // prefered, or default chart type. can be: line, area, stepLine, column, spline, splineArea, scatter
            }, function callback(err , success){
                if( err ) return console.error(err);
            });
        }
        
        // Create log entry
        Homey.manager('insights').createEntry(symbol, market_cap, new Date(), function(err, success){
            if( err ) return console.error(err);
        })
    });
}

Homey.manager('flow').on('trigger.coin_updated.coin.autocomplete', function(callback, args){
    var active_coins = [];
    for (var i in coins) {
        active_coins.push({
            name: i,
        });
    }

    callback( null, active_coins ); // err, result
});

Homey.manager('flow').on('trigger.coin_updated', function( callback, args, state ) {
    if( args.coin.name == state ) {
        callback( null, true ); // If true, this flow should run. The callback is (err, result)-style.
    } else {
        callback( null, false );
    }
});

Homey.manager('flow').on('action.refresh_data', function( callback, args, state ) {
    try {
        update_coins();
        callback( null, true );
    } catch (exception) {
        Homey.log(exception);
        callback( null, false );
    } 
});

// Fired when a setting has been changed
Homey.manager('settings').on('set', function(field){
    update_coins();
    start_timer();
});

module.exports.init = init;