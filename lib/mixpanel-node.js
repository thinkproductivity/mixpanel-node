/*
    Heavily inspired by the original js library copyright Mixpanel, Inc.
    (http://mixpanel.com/)

    Copyright (c) 2012 Carl Sverre

    Released under the MIT license.
*/

var http            = require('http'),
    querystring     = require('querystring'),
    Buffer          = require('buffer').Buffer;

var create_client = function(token, config) {
    var metrics = {};
    
    if(!token) {
        throw new Error("The Mixpanel Client needs a Mixpanel token: `init(token)`");
    }
    
    metrics.config = {
        test: false,
        debug: false
    };
    
    metrics.properties = {
        distinct_id: null,
        name_tag: null
    };
    
    metrics.token = token;

    /**
        send_request(data)
        ---
        this function sends an async GET request to mixpanel
        
        data:object                     the data to send in the request
        callback:function(err:Error)    callback is called when the request is
                                        finished or an error occurs
    */
    metrics.send_request = function(endpoint, data, callback) {
        callback = callback || function() {};
        var event_data = new Buffer(JSON.stringify(data));
        var request_data = {
            'data': event_data.toString('base64'),
            'ip': 0
        };

        if (endpoint === '/import') {
            var key = metrics.config.key;
            if (!key) {
                throw new Error("The Mixpanel Client needs a Mixpanel api key when importing old events: `init(token, { key: ... })`");
            }
            request_data.api_key = key;
        }
        
        var request_options = {
            host: 'api.mixpanel.com',
            port: 80,
            headers: {}
        };
    
        if (metrics.config.test) { request_data.test = 1; }
        
        var query = querystring.stringify(request_data);
        
        request_options.path = [endpoint,"?",query].join("");
        
        http.get(request_options, function(res) {
            var data = "";
            res.on('data', function(chunk) {
               data += chunk;
            });
            
            res.on('end', function() {
                var e = (data != '1') ? new Error("Mixpanel Server Error: " + data) : undefined;
                callback(e);
            });
        }).on('error', function(e) {
            if(metrics.config.debug) {
                console.log("Got Error: " + e.message);
            }
            callback(e);
        });
    };
    
    /**
        track(event, properties, callback)
        ---
        this function sends an event to mixpanel.
        
        event:string                    the event name
        properties:object               additional event properties to send
        callback:function(err:Error)    callback is called when the request is
                                        finished or an error occurs
    */
    metrics.track = function(event, properties, callback) {
        if (typeof(properties) === 'function' || !properties) {
            callback = properties;
            properties = {};
        }

        // if properties.time exists, use import endpoint
        var endpoint = (typeof(properties.time) === 'number') ? '/import' : '/track';

        properties.token = metrics.token;
        properties.mp_lib = "node";

        if (metrics.properties.distinct_id !== null) {
            properties.distinct_id = metrics.properties.distinct_id;
        }

        if (metrics.properties.name_tag !== null) {
            properties.mp_name_tag = metrics.properties.name_tag;
        }

        var data = {
            'event' : event,
            'properties' : properties
        };
        
        if (metrics.config.debug) {
            console.log("Sending the following event to Mixpanel:");
            console.log(data);
        }
        
        metrics.send_request(endpoint, data, callback);
    };

    /**
        identify(uniqueID)
        ---
        Identify a user with a unique id.  All subsequent
        actions caused by this user will be tied to this identity.  This
        property is used to track unique visitors.

        uniqueID:string               uniquely identifies the user
    */
    metrics.identify = function(uniqueID) {
        metrics.properties.distinct_id = uniqueID;
    };

    /**
        name_tag(name)
        ---
        Provide a string to recognize the user by.  The string passed to
        this method will appear in the Mixpanel Streams product rather
        than an automatically generated name.  Name tags do not have to
        be unique.

        name:string              the user identifier
    */
    metrics.name_tag = function(name) {
        metrics.properties.name_tag = name;
    };

    /**
        import(event, properties, callback)
        ---
        This function sends an event to mixpanel using the import
        endpoint.  The time argument should be either a Date or Number,
        and should signify the time the event occurred.

        It is highly recommended that you specify the distinct_id
        property for each event you import, otherwise the events will be
        tied to the IP address of the sending machine.

        For more information look at:
        https://mixpanel.com/docs/api-documentation/importing-events-older-than-31-days

        event:string                    the event name
        time:date|number                the time of the event
        properties:object               additional event properties to send
        callback:function(err:Error)    callback is called when the request is
                                        finished or an error occurs
    */
    metrics.import = function(event, time, properties, callback) {
        if (typeof(properties) === 'function' || !properties) {
            callback = properties;
            properties = {};
        }

        if (time === void 0) {
            throw new Error("The import method requires you to specify the time of the event");
        } else if (Object.prototype.toString.call(time) === '[object Date]') {
            time = Math.floor(time.getTime() / 1000);
        }

        properties.time = time;

        metrics.track(event, properties, callback);
    };

    metrics.people = {
        /**
            people.set(distinct_id, prop, to, callback)
            ---
            set properties on an user record in engage
        
            usage:
                
                mixpanel.people.set('bob', 'gender', 'm');

                mixpanel.people.set('joe', {
                    'company': 'acme',
                    'plan': 'premium'
                });
        */
        set: function(distinct_id, prop, to, callback) {
            var $set = {}, data = {};

            if (typeof(prop) === 'object') {
                callback = to;
                $set = prop;
            } else {
                $set[prop] = to;
            }

            var data = {
                '$set': $set,
                '$token': metrics.token,
                '$distinct_id': distinct_id
            }

            if(metrics.config.debug) {
                console.log("Sending the following data to Mixpanel (Engage):");
                console.log(data);
            }
            
            metrics.send_request('/engage', data, callback);
        },

        /**
            people.increment(distinct_id, prop, to, callback)
            ---
            increment/decrement properties on an user record in engage
        
            usage:

                mixpanel.people.increment('bob', 'page_views', 1);

                // or, for convenience, if you're just incrementing a counter by 1, you can
                // simply do
                mixpanel.people.increment('bob', 'page_views');

                // to decrement a counter, pass a negative number
                mixpanel.people.increment('bob', 'credits_left', -1);

                // like mixpanel.people.set(), you can increment multiple properties at once:
                mixpanel.people.increment('bob', {
                    counter1: 1,
                    counter2: 3,
                    counter3: -2
                });
        */
        increment: function(distinct_id, prop, by, callback) {
            var $add = {}, data = {};

            if (typeof(prop) === 'object') {
                callback = by;
                Object.keys(prop).forEach(function(key) {
                    var val = prop[key];

                    if (isNaN(parseFloat(val))) {
                        if (metrics.config.debug) {
                            console.error("Invalid increment value passed to mixpanel.people.increment - must be a number");
                            console.error("Passed " + key + ":" + val);
                        }
                        return;
                    } else {
                        $add[key] = val;
                    }
                });
            } else {
                if (!by) { by = 1; }
                $add[prop] = by;
            }

            var data = {
                '$add': $add,
                '$token': metrics.token,
                '$distinct_id': distinct_id
            }

            if(metrics.config.debug) {
                console.log("Sending the following data to Mixpanel (Engage):");
                console.log(data);
            }
            
            metrics.send_request('/engage', data, callback);
        },

        /**
            people.track_charge(distinct_id, amount, properties, callback)
            ---
            Record that you have charged the current user a certain
            amount of money.

            usage:

                // charge a user $29.99
                mixpanel.people.track_charge('bob', 29.99);

                // charge a user $19 on the 1st of february
                mixpanel.people.track_charge('bob', 19, { '$time': new Date('feb 1 2012') });
        */
        track_charge: function(distinct_id, amount, properties, callback) {
            var $append = {}, data = {};

            if (!properties) { properties = {}; }

            if (typeof(amount) !== 'number') {
                amount = parseFloat(amount);
                if (isNaN(amount)) {
                    console.error("Invalid value passed to mixpanel.people.track_charge - must be a number");
                    return;
                }
            }

            properties['$amount'] = amount;

            if (properties.hasOwnProperty('$time')) {
                var time = properties['$time'];
                if (Object.prototype.toString.call(time) === '[object Date]') {
                    properties['$time'] = time.toISOString();
                }
            }

            var data = {
                '$append': { '$transactions': properties },
                '$token': metrics.token,
                '$distinct_id': distinct_id
            }

            if(metrics.config.debug) {
                console.log("Sending the following data to Mixpanel (Engage):");
                console.log(data);
            }

            metrics.send_request('/engage', data, callback);
        },

        /**
            people.clear_charges(distinct_id, callback)
            ---
            Clear all the current user's transactions.

            usage:

                mixpanel.people.clear_charges('bob');
        */
        clear_charges: function(distinct_id, callback) {
            var data = {
                '$set': { '$transactions': [] },
                '$token': metrics.token,
                '$distinct_id': distinct_id
            };

            if(metrics.config.debug) {
                console.log("Clearing this user's charges:", distinct_id);
            }

            metrics.send_request('/engage', data, callback);
        },

        /**
            people.delete_user(distinct_id, callback)
            ---
            delete an user record in engage
        
            usage:

                mixpanel.people.delete_user('bob');
        */
        delete_user: function(distinct_id, callback) {
            var data = {
                '$delete': distinct_id,
                '$token': metrics.token,
                '$distinct_id': distinct_id
            };

            if(metrics.config.debug) {
                console.log("Deleting the user from engage:", distinct_id);
            }
            
            metrics.send_request('/engage', data, callback);
        }
    };
    
    /**
        set_config(config)
        ---
        Modifies the mixpanel config
        
        config:object       an object with properties to override in the
                            mixpanel client config
    */
    metrics.set_config = function(config) {
        for (var c in config) {
            if (config.hasOwnProperty(c)) {
                metrics.config[c] = config[c];
            }
        }
    };

    if (config) {
        metrics.set_config(config);
    }
    
    return metrics;
};

// module exporting
module.exports = {
    Client: function(token) {
        console.warn("The function `Client(token)` is deprecated.  It is now called `init(token)`.");
        return create_client(token);
    },
    init: create_client
};
