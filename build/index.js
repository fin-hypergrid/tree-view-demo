(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
'use strict';

function DataSourceBase() {}
DataSourceBase.extend = require('extend-me');
DataSourceBase.prototype = {
    constructor: DataSourceBase.prototype.constructor,

    $$CLASS_NAME: 'DataSourceBase',

    replaceIndent: '_',

    isNullObject: true,

    DataSourceError: DataSourceError,

    initialize: function(dataSource) {
        var bottomLayer = getBottomLayer(this),
            bubbleLayer = dataSource
                ? getBottomLayer(this.dataSource = dataSource) // reference private "bubble layer" previously injected
                : Object.create(DataSourceBase.prototype); // inject a private "bubble layer" beneath `this` data source's prototype

        if (bottomLayer !== bubbleLayer) {
            Object.setPrototypeOf(bottomLayer, bubbleLayer);
        }
    },

    /**
     * Allow methods to bubble (with optional fallback).
     * Note that `initialize` is ignored.
     * @param {object} [iface] - Bubble each included setter and/or getter or method, calling the fallback when not handled.
     * @param {string[]} [filter] - When defined, acts as a whitelist for items in `iface` (or a blacklist if `filter.blacklist` is truthy).
     * @returns {number} The number of items bubbled after filter out `initialize`, whitelist/blacklist, and non-methods.
     */
    setInterface: function(iface, filter) {
        var bubbled = 0;
        Object.getOwnPropertyNames(iface).forEach(function(key) {
            if (key === 'initialize') {
                return;
            }

            if (filter) {
                var listed = (filter.indexOf(key) >= 0);
                if (!(filter.blacklist ^ listed)) {
                    return;
                }
            }

            var descriptor = Object.getOwnPropertyDescriptor(iface, key);
            var newdesc = {};

            if (typeof descriptor.get === 'function') {
                newdesc.get = function() {
                    if (this.dataSource) {
                        return this.dataSource[key];
                    } else {
                        return descriptor.get();
                    }
                };
            }

            if (typeof descriptor.set === 'function') {
                newdesc.set = function(arg) {
                    if (this.dataSource) {
                        this.dataSource[key](arg);
                    } else {
                        descriptor.set(arg);
                    }
                };
            }

            if (typeof descriptor.value === 'function') {
                newdesc.value = function() {
                    if (this.dataSource) {
                        return this.dataSource[key].apply(this.dataSource, arguments);
                    } else {
                        return descriptor.value.apply(null, arguments);
                    }
                };
            }

            if (Object.keys(newdesc).length) {
                var bubbleLayer = getBottomLayer(this);

                // allow possible reconfig/removal later
                newdesc.enumerable = newdesc.writeable = newdesc.configurable = true;

                Object.defineProperty(bubbleLayer, key, newdesc);

                bubbled += 1;
            }
        }, this);
        return bubbled;
    },

    /**
     * @summary Get object that defines the method.
     * @dsc Searches the data source for the object that owns the named method.
     *
     * This will be somewhere in the prototype chain of the data source.
     * Searches each member of the data source pipeline from tip to base.
     *
     * Useful for overriding or deleting a method.
     * @param string {methodName}
     * @returns {object|undefined} The object that owns the found method or `undefined` if not found.
     */
    getOwnerOf: function(methodName) {
        for (var dataSource = this; dataSource; dataSource = dataSource.dataSource) {
            if (typeof dataSource[methodName] === 'function') {
                for (var object = dataSource; object; object = Object.getPrototypeOf(object)) {
                    if (object.hasOwnProperty(methodName)) {
                        return object;
                    }
                }
            }
        }
    },


    // DEBUGGING AIDS

    /**
     * Get new object with name and index given the name or the index.
     * @param {string|number} columnOrIndex - Column name or index.
     * @returns {{name: string, index: number}}
     */
    getColumnInfo: function(columnOrIndex) {
        var name, index, result,
            schema = this.getSchema();

        if (typeof columnOrIndex === 'number') {
            index = columnOrIndex;
            name = schema[index].name;
        } else {
            name = columnOrIndex;
            index = schema.findIndex(function(columnSchema) {
                return columnSchema.name === name;
            });
        }

        if (name && index >= 0) {
            result = {
                name: name,
                index: index
            };
        }

        return result;
    },

    fixIndentForTableDisplay: function(string) {
        var count = string.search(/\S/);
        var end = string.substring(count);
        var result = Array(count + 1).join(this.replaceIndent) + end;
        return result;
    },

    dump: function(max) {
        max = Math.min(this.getRowCount(), max || Math.max(100, this.getRowCount()));
        var data = [];
        var schema = this.getSchema();
        var fields = schema ? schema.map(function(cs) { return cs.name; }) : this.getHeaders();
        var cCount = this.getColumnCount();
        var viewMakesSense = this.viewMakesSense;
        for (var r = 0; r < max; r++) {
            var row = {};
            for (var c = 0; c < cCount; c++) {
                var val = this.getValue(c, r);
                if (c === 0 && viewMakesSense) {
                    val = this.fixIndentForTableDisplay(val);
                }
                row[fields[c]] = val;
            }
            data[r] = row;
        }
        console.table(data);
    }
};

// Get the oldest ancestor class (prototype) younger than DataSourceBase (or Object)
function getBottomLayer(prototype) {
    do {
        var descendant = prototype;
        var prototype = Object.getPrototypeOf(descendant);
    }
        while (prototype !== DataSourceBase.prototype);

    return descendant;
}

function failSilently() {}


function DataSourceError(message) {
    this.message = message;
}

// extend from `Error`
DataSourceError.prototype = Object.create(Error.prototype);

// override error name displayed in console
DataSourceError.prototype.name = 'DataSourceError';

module.exports = DataSourceBase;

},{"extend-me":2}],2:[function(require,module,exports){
'use strict';

var overrider = require('overrider');

/** @namespace extend-me **/

/** @summary Extends an existing constructor into a new constructor.
 *
 * @returns {Constructor} A new constructor, extended from the given context, possibly with some prototype additions.
 *
 * @desc Extends "objects" (constructors), with optional additional code, optional prototype additions, and optional prototype member aliases.
 *
 * > CAVEAT: Not to be confused with Underscore-style .extend() which is something else entirely. I've used the name "extend" here because other packages (like Backbone.js) use it this way. You are free to call it whatever you want when you "require" it, such as `var inherits = require('extend')`.
 *
 * Provide a constructor as the context and any prototype additions you require in the first argument.
 *
 * For example, if you wish to be able to extend `BaseConstructor` to a new constructor with prototype overrides and/or additions, basic usage is:
 *
 * ```javascript
 * var Base = require('extend-me').Base;
 * var BaseConstructor = Base.extend(basePrototype); // mixes in .extend
 * var ChildConstructor = BaseConstructor.extend(childPrototypeOverridesAndAdditions);
 * var GrandchildConstructor = ChildConstructor.extend(grandchildPrototypeOverridesAndAdditions);
 * ```
 *
 * This function (`extend()`) is added to the new extended object constructor as a property `.extend`, essentially making the object constructor itself easily "extendable." (Note: This is a property of each constructor and not a method of its prototype!)
 *
 * @this Base class being extended from (i.e., its constructor function object).
 *
 * @param {string} [extendedClassName] - This is simply added to the prototype as $$CLASS_NAME. Useful for debugging because all derived constructors appear to have the same name ("Constructor") in the debugger.
 *
 * @param {extendedPrototypeAdditionsObject} [prototypeAdditions] - Object with members to copy to new constructor's prototype.
 *
 * @property {boolean} [debug] - See parameter `extendedClassName` _(above)_.
 *
 * @property {object} Base - A convenient base class from which all other classes can be extended.
 *
 * @memberOf extend-me
 */
function extend(extendedClassName, prototypeAdditions) {
    switch (arguments.length) {
        case 0:
            prototypeAdditions = {};
            break;
        case 1:
            switch (typeof extendedClassName) {
                case 'object':
                    prototypeAdditions = extendedClassName;
                    extendedClassName = undefined;
                    break;
                case 'string':
                    prototypeAdditions = {};
                    break;
                default:
                    throw 'Single-parameter overload must be either string or object.';
            }
            break;
        case 2:
            if (typeof extendedClassName !== 'string' || typeof prototypeAdditions !== 'object') {
                throw 'Two-parameter overload must be string, object.';
            }
            break;
        default:
            throw 'Too many parameters';
    }

    /**
     * @class
     */
    function Constructor() {
        if (this.preInitialize) {
            this.preInitialize.apply(this, arguments);
        }

        initializePrototypeChain.apply(this, arguments);

        if (this.postInitialize) {
            this.postInitialize.apply(this, arguments);
        }
    }

    /**
     * @method
     * @see {@link extend-me.extend}
     * @desc Added to each returned extended class constructor.
     */

    Constructor.extend = extend;


    /**
     * @method
     * @param {string} [ancestorConstructorName] - If given, searches up the prototype chain for constructor with matching name.
     * @returns {function|null} Constructor of parent class; or ancestor class with matching name; or null
     */
    Constructor.parent = parentConstructor;

    var prototype = Constructor.prototype = Object.create(this.prototype);
    prototype.constructor = Constructor;

    extendedClassName = extendedClassName || prototype.$$CLASS_NAME || prototype.name;
    if (extendedClassName) {
        Object.defineProperty(Constructor, 'name', { value: extendedClassName, configurable: true });
        prototype.$$CLASS_NAME = extendedClassName;
    }

    overrider(prototype, prototypeAdditions);

    if (typeof this.postExtend === 'function') {
        this.postExtend(prototype);
    }

    return Constructor;
}

function Base() {}
Base.prototype = {

    constructor: Base.prototype.constructor,

    /**
     * Access a member of the super class.
     * @returns {Object}
     */
    get super() {
        return Object.getPrototypeOf(Object.getPrototypeOf(this));
    },

    /**
     * Find member on prototype chain beginning with super class.
     * @param {string} memberName
     * @returns {undefined|*} `undefined` if not found; value otherwise.
     */
    superMember: function(memberName) {
        var parent = this.super;
        do { parent = Object.getPrototypeOf(parent); } while (!parent.hasOwnProperty(memberName));
        return parent && parent[memberName];
    },

    /**
     * Find method on prototype chain beginning with super class.
     * @param {string} methodName
     * @returns {function}
     */
    superMethod: function(methodName) {
        var method = this.superMember(methodName);
        if (typeof method !== 'function') {
            throw new TypeError('this.' + methodName + ' is not a function');
        }
        return method;
    },

    /**
     * Find method on prototype chain beginning with super class and call it with remaining args.
     * @param {string} methodName
     * @returns {*}
     */
    callSuperMethod: function(methodName) {
        return this.superMethod(methodName).apply(this, Array.prototype.slice.call(arguments, 1));
    }
};
Base.extend = extend;
extend.Base = Base;

/**
 * Optional static method is called with new "class" (constructor) after extending.
 * This permits miscellaneous tweaking and cleanup of the new class.
 * @method postExtend
 * @param {object} prototype
 * @memberOf Base
 */

/** @typedef {function} extendedConstructor
 * @property prototype.super - A reference to the prototype this constructor was extended from.
 * @property [extend] - If `prototypeAdditions.extendable` was truthy, this will be a reference to {@link extend.extend|extend}.
 */

/** @typedef {object} extendedPrototypeAdditionsObject
 * @desc All members are copied to the new object. The following have special meaning.
 * @property {function} [initialize] - Additional constructor code for new object. This method is added to the new constructor's prototype. Gets passed new object as context + same args as constructor itself. Called on instantiation after similar function in all ancestors called with same signature.
 * @property {function} [preInitialize] - Called before the `initialize` cascade. Gets passed new object as context + same args as constructor itself. If not defined here, the top-most (and only the top-most) definition found on the prototype chain is called.
 * @property {function} [postInitialize] - Called after the `initialize` cascade. Gets passed new object as context + same args as constructor itself. If not defined here, the top-most (and only the top-most) definition found on the prototype chain is called.
 */

/** @summary Call all `initialize` methods found in prototype chain, beginning with the most senior ancestor's first.
 * @desc This recursive routine is called by the constructor.
 * 1. Walks back the prototype chain to `Object`'s prototype
 * 2. Walks forward to new object, calling any `initialize` methods it finds along the way with the same context and arguments with which the constructor was called.
 * @private
 * @memberOf extend-me
 */
function initializePrototypeChain() {
    var term = this,
        args = arguments;
    recur(term);

    function recur(obj) {
        var proto = Object.getPrototypeOf(obj);
        if (proto.constructor !== Object) {
            recur(proto);
            if (proto.hasOwnProperty('initialize')) {
                proto.initialize.apply(term, args);
            }
        }
    }
}

function parentConstructor(ancestorConstructorName) {
    var prototype = this.prototype;
    if (prototype) {
        do {
            prototype = Object.getPrototypeOf(prototype);
        } while (ancestorConstructorName && prototype && prototype.constructor.name !== ancestorConstructorName);
    }
    return prototype && prototype.constructor;
}

module.exports = extend;

},{"overrider":3}],3:[function(require,module,exports){
'use strict';

/** @module overrider */

/**
 * Mixes members of all `sources` into `target`, handling getters and setters properly.
 *
 * Any number of `sources` objects may be given and each is copied in turn.
 *
 * @example
 * var overrider = require('overrider');
 * var target = { a: 1 }, source1 = { b: 2 }, source2 = { c: 3 };
 * target === overrider(target, source1, source2); // true
 * // target object now has a, b, and c; source objects untouched
 *
 * @param {object} object - The target object to receive sources.
 * @param {...object} [sources] - Object(s) containing members to copy to `target`. (Omitting is a no-op.)
 * @returns {object} The target object (`target`)
 */
function overrider(target, sources) { // eslint-disable-line no-unused-vars
    for (var i = 1; i < arguments.length; ++i) {
        mixIn.call(target, arguments[i]);
    }

    return target;
}

/**
 * Mix `this` members into `target`.
 *
 * @example
 * // A. Simple usage (using .call):
 * var mixInTo = require('overrider').mixInTo;
 * var target = { a: 1 }, source = { b: 2 };
 * target === overrider.mixInTo.call(source, target); // true
 * // target object now has both a and b; source object untouched
 *
 * @example
 * // B. Semantic usage (when the source hosts the method):
 * var mixInTo = require('overrider').mixInTo;
 * var target = { a: 1 }, source = { b: 2, mixInTo: mixInTo };
 * target === source.mixInTo(target); // true
 * // target object now has both a and b; source object untouched
 *
 * @this {object} Target.
 * @param target
 * @returns {object} The target object (`target`)
 * @memberOf module:overrider
 */
function mixInTo(target) {
    var descriptor;
    for (var key in this) {
        if ((descriptor = Object.getOwnPropertyDescriptor(this, key))) {
            Object.defineProperty(target, key, descriptor);
        }
    }
    return target;
}

/**
 * Mix `source` members into `this`.
 *
 * @example
 * // A. Simple usage (using .call):
 * var mixIn = require('overrider').mixIn;
 * var target = { a: 1 }, source = { b: 2 };
 * target === overrider.mixIn.call(target, source) // true
 * // target object now has both a and b; source object untouched
 *
 * @example
 * // B. Semantic usage (when the target hosts the method):
 * var mixIn = require('overrider').mixIn;
 * var target = { a: 1, mixIn: mixIn }, source = { b: 2 };
 * target === target.mixIn(source) // true
 * // target now has both a and b (and mixIn); source untouched
 *
 * @param source
 * @returns {object} The target object (`this`)
 * @memberOf overrider
 * @memberOf module:overrider
 */
function mixIn(source) {
    var descriptor;
    for (var key in source) {
        if ((descriptor = Object.getOwnPropertyDescriptor(source, key))) {
            Object.defineProperty(this, key, descriptor);
        }
    }
    return this;
}

overrider.mixInTo = mixInTo;
overrider.mixIn = mixIn;

module.exports = overrider;

},{}],4:[function(require,module,exports){
/* eslint-env commonjs */

'use strict';

var Base = require('datasaur-base');

/**
 * @constructor
 */
var DataSourceIndexed = Base.extend('DataSourceIndexed', {

    isNullObject: false,

    /**
     * @memberOf DataSourceIndexed#
     * @param dataSource
     */
    initialize: function(dataSource) {
        this.index = [];
    },

    /**
     * @memberOf DataSourceIndexed#
     * @param y
     * @returns {*}
     */
    transposeY: function(y) {
        return this.index.length ? this.index[y] : y;
    },

    getDataIndex: function(y) {
        return this.dataSource.getDataIndex(this.transposeY(y));
    },

    /**
     * @memberOf DataSourceIndexed#
     * @param y
     * @returns {object}
     */
    getRow: function(y) {
        return this.dataSource.getRow(this.transposeY(y));
    },

    getRowMetadata: function(y, newMetadata) {
        return this.dataSource.getRowMetadata(this.transposeY(y), newMetadata);
    },

    setRowMetadata: function(y, metadata) {
        return this.dataSource.setRowMetadata(this.transposeY(y), metadata);
    },

    /**
     * @memberOf DataSourceIndexed#
     * @param x
     * @param y
     * @returns {*|Mixed}
     */
    getValue: function(x, y) {
        return this.dataSource.getValue(x, this.transposeY(y));
    },

    /**
     * @memberOf DataSourceIndexed#
     * @param {number} x
     * @param {number} y
     * @param {*} value
     */
    setValue: function(x, y, value) {
        this.dataSource.setValue(x, this.transposeY(y), value);
    },

    /**
     * @memberOf DataSourceIndexed#
     * @returns {Number|*}
     */
    getRowCount: function() {
        return this.index.length || this.dataSource.getRowCount();
    },

    /**
     * @memberOf DataSourceIndexed#
     */
    clearIndex: function() {
        this.index.length = 0;
    },

    /**
     * @memberOf DataSourceIndexed#
     * @param {filterPredicate} predicate
     * @returns {number[]}
     */
    buildIndex: function(predicate) {
        var rowCount = this.dataSource.getRowCount(),
            index = this.index;

        this.clearIndex();

        for (var r = 0; r < rowCount; r++) {
            if (!predicate || predicate.call(this, r)) {
                index.push(r);
            }
        }

        return index;
    }
});

/** @typedef {function} filterPredicate
 * @summary Applies filter to given row.
 * @this {DataSourceGlobalFilter}
 * @param {nubmer} r - Row index of row data within rows array `this.dataSource.data[]`.
 * @param {object} rowObject - Row data; element of `this.dataSource.data[]`.
 * @returns {boolean} Row qualifies (passes through filter).
 */

/**
 * Used by the sorters (`DataSourceSorter` and `DataSourceTreeviewSorter`).
 * @param {object} dataRow
 * @param {string} columnName
 * @returns {*}
 */
DataSourceIndexed.valOrFunc = function(dataRow, columnName, calculator) {
    var result;
    if (dataRow) {
        result = dataRow[columnName];
        calculator = (typeof result)[0] === 'f' && result || calculator;
        if (calculator) {
            result = calculator(dataRow, columnName);
        }
    }
    return result;
};

module.exports = DataSourceIndexed;

},{"datasaur-base":1}],5:[function(require,module,exports){
/* eslint-env browser */

'use strict';

var DataSourceBase = require('datasaur-base');

var getSchema = require('fin-hypergrid-field-tools').getSchema;


/** @typedef {object} columnSchemaObject
 * @property {string} name - The required column name.
 * @property {string} [header] - An override for derived header
 * @property {function} [calculator] - A function for a computed column. Undefined for normal data columns.
 * @property {string} [type] - Used for sorting when and only when comparator not given.
 * @property {object} [comparator] - For sorting, both of following required:
 * @property {function} comparator.asc - ascending comparator
 * @property {function} comparator.desc - descending comparator
 */


/**
 * @param {object} [options]
 * @param {object[]} [options.data]
 * @param {object[]} [options.schema]
 * @constructor
 */
var DataSourceLocal = DataSourceBase.extend('DataSourceLocal',  {

    META: '__META',

    initialize: function(dataSorce) {
        /**
         * @summary The array of column schema objects.
         * @name schema
         * @type {columnSchemaObject[]}
         * @memberOf DataSourceLocal#
         */
        this.schema = [];

        /**
         * @summary The array of uniform data objects.
         * @name data
         * @type {object[]}
         * @memberOf DataSourceLocal#
         */
        this.data = [];
    },

    /**
     * Establish a new data and schema.
     * If no data provided, data will be set to 0 rows.
     * If no schema provided AND no previously set schema, new schema will be derived from data.
     * @param {object[]} [data=[]] - Array of uniform objects containing the grid data.
     * @param {columnSchemaObject[]} [schema=[]]
     * @memberOf DataSourceLocal#
     */
    setData: function(data, schema) {
        /**
         * @summary The array of uniform data objects.
         * @name data
         * @type {object[]}
         * @memberOf DataSourceLocal#
         */
        this.data = data || [];

        if (schema) {
            this.setSchema(schema);
        } else if (this.data.length && !this.schema.length) {
            this.setSchema([]);
        }
    },

    /**
     * @returns {columnSchemaObject[]}
     * @memberOf DataSourceLocal#
     */
    getSchema:  function(){
        return this.schema;
    },
    /**
     * Caveat: Do not call on a data update when you expect to reuse the existing schema.
     * @param schema
     * @memberOf DataSourceLocal#
     */
    setSchema: function(schema){
        this.schema = schema.length ? schema : getSchema(this.data);
    },

    /**
     * @param y
     * @returns {dataRowObject}
     * @memberOf DataSourceLocal#
     */
    getRow: function(y) {
        return this.data[y];
    },

    /**
     * Update or blank row in place.
     *
     * _Note parameter order is the reverse of `addRow`._
     * @param {number} y
     * @param {object} [dataRow] - if omitted or otherwise falsy, row renders as blank
     * @memberOf DataSourceLocal#
     */
    setRow: function(y, dataRow) {
        this.data[y] = dataRow || undefined;
    },

    /**
     * Get metadata, a hash of cell properties objects.
     * Each cell that has properties (and only such cells) have a properties object herein, keyed by column schema name.
     * @param {number} y
     * @param {object} [newMetadata] - If metadata not found sets metadata to `newMetadata` if given.
     * @returns {undefined|object} Metadata object if row found with metadata; else `newMetadata` if given; else `undefined`.
     */
    getRowMetadata: function(y, newMetadata) {
        var dataRow = this.getRow(y);
        return dataRow && (dataRow[this.META] || (newMetadata && (dataRow[this.META] = newMetadata)));
    },

    /**
     * Set or clear metadata.
     * @param {number} y
     * @param {object} [metadata] - Hash of grid properties objects.
     * Each cell that has properties (and only such cells) have a properties object herein, keyed by column schema name.
     * If omitted, deletes properties object.
     * @returns {boolean} Row was found.
     */
    setRowMetadata: function(y, metadata) {
        var dataRow = this.getRow(y);
        if (dataRow) {
            if (metadata) {
                dataRow[this.META] = metadata;
            } else {
                delete dataRow[this.META];
            }
        }
        return !!dataRow;
    },

    /**
     * Insert or append a new row.
     *
     * _Note parameter order is the reverse of `setRow`._
     * @param {object} dataRow
     * @param {number} [y=Infinity] - The index of the new row. If `y` >= row count, row is appended to end; otherwise row is inserted at `y` and row indexes of all remaining rows are incremented.
     * @memberOf DataSourceLocal#
     */
    addRow: function(dataRow, y) {
        if (y === undefined || y >= this.getRowCount()) {
            this.data.push(dataRow);
        } else {
            this.data.splice(y, 0, dataRow);
        }
    },

    /**
     * Rows are removed entirely and no longer render.
     * Indexes of all remaining rows are decreased by `rowCount`.
     * @param {number} y
     * @param {number} [rowCount=1]
     * @returns {dataRowObject[]}
     * @memberOf DataSourceLocal#
     */
    delRow: function(y, rowCount) {
        if (rowCount === undefined) { rowCount = 1; }
        return this.data.splice(y, rowCount);
    },

    /**
     * @param {number} x
     * @param {number} y
     * @returns {*}
     * @memberOf DataSourceLocal#
     */
    getValue: function(x, y) {
        var row = this.getRow(y);
        if (!row) {
            return null;
        }
        return row[getColumnName.call(this, x)];
    },

    /**
     * @param {number} x
     * @param {number} y
     * @param value
     * @memberOf DataSourceLocal#
     */
    setValue: function(x, y, value) {
        this.getRow(y)[getColumnName.call(this, x)] = value;
    },

    /**
     * @returns {number}
     * @memberOf DataSourceLocal#
     */
    getRowCount: function() {
        return this.data.length;
    },

    /**
     * @returns {number}
     * @memberOf DataSourceLocal#
     */
    getColumnCount: function() {
        return this.schema.length;
    }
});

function getColumnName(x) {
    return (typeof x)[0] === 'n' ? this.schema[x].name : x;
}


module.exports = DataSourceLocal;

},{"datasaur-base":1,"fin-hypergrid-field-tools":8}],6:[function(require,module,exports){
'use strict';

/*
 * Glossary:
 *    PK - Primary key, an ordered list of field names comprising primary key. May be given in `options.PK` or otherwise derived as needed from search arg.
 *    PX - Primary key index, map of row indexes representing ascending sort of rows per primary key. Derived as needed from data and PK.
 */

/* eslint-env commonjs */

'use strict';

var Base = require('datasaur-base');

/**
 * @constructor
 */
var DataSourceSearchable = Base.extend('DataSourceSearchable', {
    initialize: function(dataSource, options) {
        var primaryKey = options && options.primaryKey,
            suffix = typeof primaryKey === 'object' && primaryKey.name || typeof primaryKey === 'string' && primaryKey,
            PK = typeof primaryKey === 'object' && primaryKey.columns || typeof primaryKey === 'string' && [primaryKey];

        if (suffix) {
            suffix = 'By' + suffix[0].toUpperCase() + suffix.slice(1);
            Object.keys(DataSourceSearchable.prototype)
                .filter(function(key) {
                    return key !== 'initialize' && key !== 'constructor';
                })
                .forEach(function(key) {
                    this[key + suffix] = this[key];
                }, this);
            this.setInterface(this);
        } else {
            this.setInterface(this.prototype);
        }

        this.PK = PK;
    },

    // If called without args, simply deletes `this.PX` and returns `undefined`.
    // Otherwise, finds row and returns:
    // * row object if found
    // * `undefined` if not found
    findRow: function(sarg, options) {
        if (!arguments.length) {
            delete this.PX;
        } else {
            return find.call(this, sarg, options).dataRow;
        }
    },

    findRowIndex: function(sarg, options) {
        var index = find.call(this, sarg, options).PX_index;
        if (this.PX) {
            index = this.PX[index];
        }
        return index;
    },

    // Inserts new row and updates PX.
    // Throws error if row already exists
    // Returns:
    // * `true` if handled
    // * `false` if not handled (i.e., data source does not know how to add rows) (data and index untouched)
    insertRow: function(dataRow, options) {
        var row = find.call(this, dataRow, options);

        if (row.dataRow) {
            throw new Error('Row exists.');
        }

        var response = this.publish('add-row', dataRow),
            handled = response.length !== 0;

        if (handled && this.PX) {
            this.PX.splice(row.PX_index, 0, this.getRowCount() - 1);
        }

        return handled;
    },

    // finds row, deletes it, updates PX, and returns:
    // * deleted row object if found and handled
    // * `undefined` if not found (data and index untouched)
    // * `false` if found but not handled (i.e., data source does not know how to delete rows) (data and index untouched)
    deleteRow: function(sarg, options) {
        var row = find.call(this, sarg, options),
            result = row.dataRow;

        if (result) {
            var response = this.publish('del-row', this.PX[row.PX_index]),
                handled = response.length !== 0;

            if (!handled) {
                result = false;
            } else if (this.PX) {
                this.PX.splice(row.PX_index, 1);
            }
        }

        return result;
    }
});

/**
 * 1. Define PK with options.PK OR use previous definition OR derive it based on sarg.
 * 2. Don't use PX if `options.presorted` truthy; else derive if `options.PK` given OR `options.reindex` truthy OR not previously defined; else use reuse previous definition.
 * 3. Return an object containing:
 * * if found: `PX_index` (number) and `dataRow` (object)
 * * if not found: just `PX_index` (number) which is the insertion point
 * @param {object|string|number} sarg - An object that fully and uniquely describes the row being sought.
 * As a convenience feature for single-column primary keys, `sarg` may be a primitive value for that column.
 * @param options
 * @returns {{PX_index, dataRow}|{PX_index}}
 */
function find(sarg, options) {
    options = options || {};

    var PK = this.PK = derivePK.call(this, sarg);

    if (options.presorted) {
        delete this.PX;
    } else {
        if (options.reindex) {
            this.PX = undefined;
        }
        this.PX = derivePX.call(this);
    }

    if (typeof sarg === 'object') {
        sarg = PK.map(function (key) {
            if (!(key in sarg)) {
                throw new Error('Expected primary key column "' + key + '" to be part of search arg.');
            }
            return sarg[key];
        });
    } else if (PK.length === 1) {
        sarg = [sarg];
    } else {
        throw new Error('Expected search arg to be an object for multi-column primary key.');
    }

    if (sarg.length !== PK.length) {
        throw new Error('Expected fully qualified search arg.');
    }

    var min = 0, max = this.getRowCount() - 1;
    var maxKey = PK.length - 1;
    var getRow = this.PX ? getIndexedRow.bind(this) : this.getRow.bind(this);

    PK.slice(0, maxKey).forEach(function(key, i) {
        min = binSearchMin(getRow, key, sarg[i], min, max);
        max = binSearchMax(getRow, key, sarg[i], min, max) - 1;
    });

    return binSearch(getRow, PK[maxKey], sarg[maxKey], min, max);
}

function derivePK(sarg) {
    if (this.PK && this.PK.length) {
        return this.PK;
    }

    if (typeof sarg !== 'object') {
        throw new Error('Cannot derive primary key. Provide search key as object (or define options.PK).)')
    }

    return Object.keys(sarg)
        // map PK column name string[] to {key:string,hits:number}[]
        .map(function(key) {
            var s = {};
            if ('data' in this) {
                // only build unique value histogram when local data source (i.e., when `this.data` is available)
                this.data.forEach(function(dataRow) { s[dataRow[key]] = true; });
            }
            return { key: key, uniqueValues: Object.keys(s).length };
        }, this)
        // make columns with more hits higher order so search zooms in quicker
        .sort(function(a, b) {
            return b.uniqueValues - a.uniqueValues;
        })
        // get column names
        .map(function(o) {
            return o.key;
        });
}

function derivePX() {
    if (this.PX && this.PX.length) {
        return this.PX;
    }

    var PX = Array(this.getRowCount());

    for (var i = PX.length; i--;) {
        PX[i] = i;
    }

    return PX.sort(comparator.bind(this));
}

function comparator(a, b) {
    var result;
    a = this.getRow(a);
    b = this.getRow(b);
    this.PK.find(function(key) {
        var p = a[key], q = b[key];
        return result = p < q ? -1 : p > q ? 1 : 0;
    });
    return result;
}

function getID(rowIndex) {
    var dataRow = this.getRow(rowIndex);
    return this.PK.map(function(key) { return dataRow[key]; })
}

function getIndexedRow(indexedRowIndex) {
    return this.getRow(this.PX[indexedRowIndex]);
}

function binSearch(getRow, key, value, min, max) {
    while (min <= max) {
        var mid = Math.floor((min + max) / 2);
        var dataRow = getRow(mid);
        var field = dataRow[key];
        if (field > value) {
            max = mid - 1;
        } else if (field < value) {
            min = mid + 1;
        } else {
            // found
            return {
                PX_index: mid,
                dataRow: dataRow
            };
        }
    }
    // not found; return insertion point
    return { PX_index: min };
}

function binSearchMin(getRow, key, value, min, max) {
    while (min <= max) {
        var mid = Math.floor((min + max) / 2);
        if (getRow(mid)[key] >= value) {
            max = mid - 1;
        } else {
            min = mid + 1;
        }
    }
    return min;
}

function binSearchMax(getRow, key, value, min, max) {
    while (min <= max) {
        var mid = Math.floor((min + max) / 2);
        if (getRow(mid)[key] > value) {
            max = mid - 1;
        } else {
            min = mid + 1;
        }
    }
    return min;
}

module.exports = DataSourceSearchable;

},{"datasaur-base":1}],7:[function(require,module,exports){
'use strict';

var DataSourceIndexed = require('datasaur-indexed');


var DEPTH = '__DEPTH';
var EXPAND = '__EXPANDED';

/** @typedef columnAddress
 * @property {string} name - The name of a column listed in the fields array. See the {@link DataSourceTreeview#getFields|getFields()} method.
 * @property {number} index - The index of the column in the fields array. See the {@link DataSourceTreeview#getFields|getFields()} method.
 */


/**
 * @classdesc For proper sorting, include `DataSourceTreeviewSorter` in your data source pipeline, _ahead of_ (closer to the data than) this data source.
 *
 * For proper filtering, include `DataSourceTreeviewFilter` in your data source pipeline, _ahead of_ `DataSourceTreeviewSorter`, if included; or at any rate ahead of this data source.
 * @constructor
 * @param dataSource
 * @extends DataSourceIndexed
 */
var DataSourceTreeview = DataSourceIndexed.extend('DataSourceTreeview', {

    /** @summary Initialize a new instance.
     * @desc Set up {@link DataSourceTreeviewSorter} access to this object. Access is provided to the whole object although only instance variables `joined`, `idColumn`, and `parentIdColumn` are needed by the sorter. The two ID columns are passed to the {@link DataSourceDepthSorter} constructor. (If dataSource is not the sorter, this is not used but harmless.)
     *
     * Note that all ancestor classes' `initialize` methods are called (top-down) before this one. See {@link http://npmjs.org/extend-me} for more info.
     * @param dataSource
     * @memberOf DataSourceTreeview#
     */
    initialize: function(dataSource) {
        var treeview = this;
        this.setInterface({ treeview: { get: function() { return treeview; } } });
        this.setInterface(['idColumn ', 'parentIdColumn', 'treeColumn', 'groupColumn']); // bubble these getter/setters
    },

    /** @summary Reference to the primary key column address object.
     * @desc The primary key column uniquely identifies a data row.
     * Used to relate a child row to a parent row.
     * @param {number|string} indexOrName
     * @returns {columnAddress} Getter returns column address object; setter however always returns its input.
     */
    set idColumn(indexOrName) {
        this._idColumn = this.getColumnInfo(indexOrName || 'ID');
    },
    get idColumn() {
        return this._idColumn;
    },

    /** @summary Reference to the foreign key column address object.
     * @desc The foreign key column defines grouping; it relates this tree node row to its parent tree node row.
     * Top-level tree nodes have no parent.
     * In that case the value in the column is `null`.
     * @param {number|string} indexOrName
     * @returns {columnAddress} Getter returns column address object; setter however always returns its input.
     */
    set parentIdColumn(indexOrName) {
        this._parentIdColumn = this.getColumnInfo(indexOrName || 'parentID');
    },
    get parentIdColumn() {
        return this._parentIdColumn;
    },

    /** @summary Reference to the drill-down column address object.
     * @desc The drill-down column is the column that is indented and decorated with drill-down controls (triangles). A column with the given index or name must exist.
     * @param {number|string} indexOrName
     * @returns {columnAddress} Getter returns column address object; setter however always returns its input.
     */
    set treeColumn(indexOrName) {
        this._treeColumn = this.getColumnInfo(indexOrName || 'name');
    },
    get treeColumn() {
        return this._treeColumn;
    },

    /**
     /** @summary Reference to the group name column address object.
     * @desc The group name column is the column whose content describes the group. A column with the given index or name must exist.
     *
     * The treeview sorter treats the group name column differently than other columns,
     * apply a "group sort" to it, which means only the group rows (rows with children)
     * are sorted and the leaves are left alone (stable sorted).
     *
     * Normally refers to the same column as {@link DataSourceTreeview#treeColumn|treeColumn}.
     * @param {number|string} indexOrName
     * @returns {columnAddress} Getter returns column address object; setter however always returns its input.
     */
    set groupColumn(indexOrName) {
        this._groupColumn = this.getColumnInfo(indexOrName || this._treeColumn.name);
    },
    get groupColumn() {
        return this._groupColumn;
    },

    /**
     * TEMPORARY. This function included here until next version of base is published.
     * The change was to use schema rather than getFields().
     * (The current version in base is not in use because it's only used from here.)
     *
     * Get new object with name and index given the name or the index.
     * @param {string|number} columnOrIndex - Column name or index.
     * @returns {{name: string, index: number}}
     */
    getColumnInfo: function(columnOrIndex) {
        var name, index, result;

        if (typeof columnOrIndex === 'number') {
            index = columnOrIndex;
            name = this.getSchema()[index].name;
        } else {
            name = columnOrIndex;
            index = this.getSchema().findIndex(function(columnSchema) {
                return columnSchema.name === name;
            });
        }

        if (name && index >= 0) {
            result = {
                name: name,
                index: index
            };
        }

        return result;
    },

    /**
     * @summary Toggle the tree-view.
     * @desc Calculates or recalculates nesting depth of each row and marks it as "expandable" iff it has children.
     *
     * If resetting previously set data, the state of expansion of all rows that still have children is retained.
     * (All expanded rows will still be expanded when tree-view is turned back *ON*.)
     *
     * @param {boolean|object} [enable] - Turns tree-view **ON** if all four columns must exist.
     * @returns {boolean} Joined state.
     *
     * @memberOf DataSourceTreeview#
     */
    set join(enable) {
        var underlyingDataSource = this.dataSource;

        if (!(this.idColumn && this.parentIdColumn && this.treeColumn && this.groupColumn)) {
            throw ''
        }

        // successful join requires that all columns exist
        this.joined = enable;

        this.buildIndex(); // make all rows visible to getRow()

        var r = this.getRowCount();

        if (this.joined) {
            var row, ID;

            // Add __DEPTH metadatum to all rows and __EXPANDED metadatum to all "parent" rows
            var id = this.idColumn,
                pid = this.parentIdColumn;

            this.maxDepth = 0;

            while (r--) {
                var depth = 0;

                for (
                    var parentID, parentRowIndex = r;
                    (parentID = underlyingDataSource.getValue(pid.index, parentRowIndex)) != null;
                    parentRowIndex = this.findRowIndexByID(parentID)
                ) {
                    depth += 1;
                }

                if (this.maxDepth < depth) {
                    this.maxDepth = depth;
                }

                row = underlyingDataSource.getRowMetadata(r, {});
                row[DEPTH] = depth;

                ID = underlyingDataSource.getValue(id.index, r);
                if (!this.findRowByParentID(ID)) {
                    delete row[EXPAND]; // no longer expandable
                } else if (row[EXPAND] === undefined) { // retain previous setting for old rows
                    row[EXPAND] = false; // default for new row is unexpanded
                }
            }
        } else {
            // flatten the tree so group sorter sees it as a single group
            while (r--) {
                underlyingDataSource.getRowMetadata(r, {})[DEPTH] = 0;
            }
        }
    },
    get join() {
        return this.joined;
    },

    /**
     * @summary Rebuild the index.
     * @desc Rebuild the index to show only "revealed" rows. (Rows that are not inside a collapsed parent node row.)
     * @memberOf DataSourceTreeview#
     */
    apply: function() {
        if (!this.viewMakesSense()) {
            this.clearIndex();
        } else {
            this.buildIndex(rowIsRevealed);
        }
    },

    drillDownCharMap: {
        true: '\u25bc', // BLACK DOWN-POINTING TRIANGLE aka '▼'
        false: '\u25b6', // BLACK RIGHT-POINTING TRIANGLE aka '▶'
        undefined: '' // for leaf rows
    },

    /**
     * @summary Get the value for the specified cell.
     * @desc Intercepts tree column values and indents and decorates them.
     * @param x
     * @param y
     * @returns {*}
     * @memberOf DataSourceTreeview#
     */
    getValue: function(x, y) {
        var value = DataSourceIndexed.prototype.getValue.call(this, x, y);

        if (this.viewMakesSense() && x === this._treeColumn.index) {
            var row = this.getRowMetadata(y);

            if (!(value === '' && row[EXPAND] === undefined)) {
                value = Array(row[DEPTH] + 1).join('   ') + this.drillDownCharMap[row[EXPAND]] + value;
            }
        }

        return value;
    },

    viewMakesSense: function() {
        return this.joined;
    },
    /**
     * @memberOf DataSourceTreeview#
     * @param {number} columnIndex
     * @returns {*|boolean}
     */
    isDrillDown: function(columnIndex) {
        var result = this.viewMakesSense();
        if (result && columnIndex) {
            result = columnIndex === this.treeColumnIndex;
        }
        return result;
    },

    isDrillDownCol: function (event) {
        return event && event.dataCell.x === this._treeColumn.index;
    },

    /**
     * @summary Handle a click event in the drill-down column.
     * @desc Operates only on the following rows:
     * * Expandable rows - Rows with a drill-down control.
     * * Revealed rows - Rows not hidden inside of collapsed drill-downs.
     * @param y - Revealed row number. (This is not the row ID.)
     * @param {boolean} [expand] - One of:
     * * `true` - Expand all rows that are currently collapsed.
     * * `false` - Collapse all rows that are currently expanded.
     * * `undefined` (or omitted) - Expand all currently collapsed rows; collapse all currently expanded rows.
     * @param {number} [depth=Infinity] - One of:
     * * number > 0 - Apply only if row depth is above the given depth.
     * * number <= 0 - Apply only if row depth is below the given depth.
     * @returns {undefined|boolean} One of:
     * * `undefined` - Row was not expandable.
     * * `true` - Row had drill-down _and_ state changed.
     * * `false` - Row had drill-down _but_ state did _not_ change.
     * @memberOf DataSourceTreeview#
     */
    click: function(y, expand, depth) {
        if (!this.viewMakesSense()) {
            return this.dataSource.click.apply(this.dataSource, arguments);
        }

        var changed, row = this.getRowMetadata(y);
        if (row && row[EXPAND] !== undefined) {
            if (depth !== undefined && (
                depth > 0 && row[DEPTH] >= depth ||
                depth <= 0 && row[DEPTH] < -depth
            )) {
                changed = false;
            } else {
                if (expand === undefined) {
                    expand = !row[EXPAND];
                }
                changed = row[EXPAND] && !expand || !row[EXPAND] && expand;
                row[EXPAND] = expand;
            }
        }
        return changed;
    },

    /**
     * @summary Expand nested drill-downs containing this row.
     * @param ID - The unique row ID.
     * @returns {boolean} If any rows expanded.
     * @memberOf DataSourceTreeview#
     */
    revealRow: function(ID) {
        if (!this.viewMakesSense()) {
            return this.dataSource.revealRow.apply(this.dataSource, arguments);
        }

        var underlyingDataSource = this.dataSource;

        var r, parent, changed = false;
        while ((r = this.findRowIndexByID(ID)) !== undefined) {
            if (parent) {
                row = this.getRowMetadata(r);
                if (row[EXPAND] === false) {
                    row[EXPAND] = changed = true;
                }
            }
            parent = true;
            ID = underlyingDataSource.getValue(this._parentIdColumn.index, ID);
        }
        return changed;
    }
});

function rowIsRevealed(r) {
    var parentID;
    var underlyingDataSource = this.dataSource;

    // are any of the row's ancestors collapsed?
    while ((parentID = underlyingDataSource.getValue(this._parentIdColumn.index, r)) != null) {
        // walk up through each parent...
        r = this.findRowIndexByID(parentID);
        if (underlyingDataSource.getRowMetadata(r)[EXPAND] === false) { // an ancestor is collapsed
            return false; // exclude row from build
        }
    }

    // no ancestors were collapsed
    return true; // include row in build
}

Object.defineProperty(DataSourceTreeview.prototype, 'type', { value: 'treeviewer' }); // read-only property

module.exports = DataSourceTreeview;

},{"datasaur-indexed":4}],8:[function(require,module,exports){
'use strict';

/**
 * @name fields
 * @namespace
 */

var REGEXP_META_PREFIX = /^__/, // starts with double underscore
    REGEXP_WORD_SEPARATORS = /[\s\-_]*([^\s\-_])([^\s\-_]+)/g,
    REGEXP_CAPITAL_LETTERS = /[A-Z]/g,
    REGEXP_LOWER_CASE_LETTER = /[a-z]/;

/**
 * Returns an array of keys (field names) of the given data row object.
 * Field names beginning with double underscore (`__`) are considered reserved for system use and are excluded from the results.
 * @param {object} [dataRow] - If omitted or otherwise falsy, returns an empty array.
 * @returns {string[]} Member names from `dataRow` that do _not_ begin with double-underscore.
 * @memberOf namespace:fields
 */
function getFieldNames(dataRow) {
    return Object.keys(dataRow || []).filter(function(fieldName) {
        return !REGEXP_META_PREFIX.test(fieldName);
    });
}

// Replacement function for use in the default titleize function below.
// See https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/replace
function capitalize(a, b, c) {
    return b.toUpperCase() + c;
}

var shortWords = ['of', 'at', 'by', 'from', 'and', 'but', 'for', 'a', 'an', 'the'];

/**
 * Separates camel case or white-space-, hypen-, or underscore-separated-words into truly separate words and capitalizing the first letter of each except for members of `shortWords`.
 * @param string
 * @returns {string}
 * @memberOf namespace:fields
 */
function titleize(string) {
    var title = (REGEXP_LOWER_CASE_LETTER.test(string) ? string : string.toLowerCase())
        .replace(REGEXP_WORD_SEPARATORS, capitalize)
        .replace(REGEXP_CAPITAL_LETTERS, ' $&')
        .trim();

    shortWords.forEach(function(word) {
        word = ' ' + word + ' ';
        title = title.replace(new RegExp(word, 'gi'), word);
    });

    return title;
}

/**
 * Derive a schema from field names, including derived header when field name unsuitable as such.
 * A suitable field name has no underscores _and_ contains spaces and/or mixed case (but not camelCase).
 * @param data
 * @returns {Array}
 * @memberOf namespace:fields
 */
function getSchema(data){
    // find first defined dataRow
    var dataRow = data.find(function(dataRow) { return dataRow; }) || {};

    return getFieldNames(dataRow).map(function(name) {
        return name.indexOf('_') < 0 && (
            name.indexOf(' ') >= 0 ||
            /[a-z]/.test(name) && /[A-Z]/.test(name) && !/[a-z][A-Z]/.test(name)
        ) ?
            {
                name: name
            } : {
                name: name,
                header: titleize(name)
            };
    });
}

module.exports = {
    getFieldNames: getFieldNames,
    titleize: titleize,  // override as needed for custom header titleization
    getSchema: getSchema
};

},{}],9:[function(require,module,exports){
'use strict';

exports.grid = [
'.hypergrid-container {',
'	position: relative;',
'	height: 500px;',
'}',
'.hypergrid-container > div:first-child {',
'	position: absolute;',
'	left: 0;',
'	top: 0;',
'	right: 0;',
'	bottom: 0;',
'}',
'.hypergrid-container > div:first-child > div.info {',
'	position: absolute;',
'	display: none; /* initially hidden */',
'	margin-top: 150px; /* to place below headers */',
'	color: #eee;',
'	text-shadow: 1px 1px #ccc;',
'	font-size: 36pt;',
'	font-weight: bold;',
'	text-align: center;',
'	top: 0; right: 0; bottom: 0; left: 0;',
'}',
'.hypergrid-textfield {',
'	position: absolute;',
'	font-size: 12px;',
'	color: black;',
'	background-color: ivory;',
'	box-sizing: border-box;',
'	margin: 0;',
'	padding: 0 5px;',
'	border: 0; /*border: 1px solid #777;*/',
'	outline: 0;',
'}',
'',
''
].join('\n');

},{}],10:[function(require,module,exports){
module.exports = {
	"calendar": {
		type: "image/png",
		data: "iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAc0lEQVR4nIXQwQkCMRSE4U9ZLMCT9Xjaq2AfNhfYU5oQLMAOtoN48EWei5iBIRPe/yYQ3qrhf1lFG7iKcEaJxSfukUvMWgdHavt0uWHtg2QwxXnAnJZ2uOLyVZtybzzhgWNmfoFl0/YB87NbzR1cjP9xeQHSDC6mcL1xFQAAAABJRU5ErkJggg=="
	},
	"checked": {
		type: "image/png",
		data: "iVBORw0KGgoAAAANSUhEUgAAAA0AAAAPCAYAAAA/I0V3AAAABGdBTUEAALGPC/xhBQAAAAlwSFlzAAAOwgAADsIBFShKgAAAABh0RVh0U29mdHdhcmUAcGFpbnQubmV0IDQuMC41ZYUyZQAAAYJJREFUOE+NkstLglEQxf0fahG0iFrUxm2ElFDYLohCqCDaCAkWPaxIRbFFEJEaGEKLDCoMETRFUAMLyaIHBUG6sSKIMtKFqEhLT818ZUgmDhzu3DPn9z0uV1RrmUwmyGQyqNVqfFvViwBxu5RFPZuLSyGMKhz/qlEsRV19K8xm6y+w7bpBPFnAferjj3bdQX6DpHcAUwavAHUN2RGIZxBJZHH2mC/TUeydwwTZvBegLENNgw7sX6Wh1FswNmPEmjPCDyGRRwCtW9E3tMgdAtQw7GZjYcNX+gza2wJ3ZXsSZUuQ0vWCOV8SHfJJ/uluhbHUj1v8PKNMszIoQNRMHCShD6Wh8zyhrbOPwz8w+STKlCCJ7oRNUzQH63kBs5thBghePXxlj2aUoSxDPcuXPNiLAc5EEZ6HIkbmV2DYiXBPHs0o079+K0DTVj/s11mE00A0L+g4VcDp10qKZMAzytBhMaTRaPmYg885DlcSzSij0eoEiIouoUqlqqqaL2rlEok+Ad4vlfzPoVDsAAAAAElFTkSuQmCC"
	},
	"down-rectangle": {
		type: "image/png",
		data: "iVBORw0KGgoAAAANSUhEUgAAAAkAAAAECAYAAABcDxXOAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAAadEVYdFNvZnR3YXJlAFBhaW50Lk5FVCB2My41LjExR/NCNwAAABpJREFUGFdjgIL/eDAKIKgABggqgAE0BQwMAPTlD/Fpi0JfAAAAAElFTkSuQmCC"
	},
	"filter-off": {
		type: "image/png",
		data: "iVBORw0KGgoAAAANSUhEUgAAAA4AAAAMCAYAAABSgIzaAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAAYdEVYdFNvZnR3YXJlAHBhaW50Lm5ldCA0LjAuNWWFMmUAAAChSURBVChTzZHBCoUgFET9TqEiskgyWoutQvRLRIr+cR7XQAjiJW/1BgZmMUevXsY5xy9OoDEGMcYiUzeB67qibVuwQjVNA6311V+WBeM4vsLDMEApde/1fY9pmtI453neHEKAlBJd1z0fXtc16PbjODK07zvmeUZVVd8nooc75zJIOX3Gm6i0bVsGKf8xKIRIuyJTLgJJ3nvQzsjW2geIsQ/pr9hMVrSncAAAAABJRU5ErkJggg=="
	},
	"filter-on": {
		type: "image/png",
		data: "iVBORw0KGgoAAAANSUhEUgAAAA4AAAAMCAYAAABSgIzaAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAAYdEVYdFNvZnR3YXJlAHBhaW50Lm5ldCA0LjAuNWWFMmUAAACoSURBVChTY3BqfP2fHAzWmDbj7f8p294RhVOBasEa02e+/e/VBmQQCTxaX/9PnvYGoj5ywpv/Qd2ENft3vv4f1gfVBAP+nW/+h/a+ATtn1q73KHjytvdgg3070DTBgHvL6/8g22fsQGiaDmSHA21xaybgIpDHixa8hWssnA8NDEIApCh3LkIjiD2INYJCL2X6W3B8gdhEaQQBUOCA4gyE8+e9xaKJgQEA/74BNE3cElkAAAAASUVORK5CYII="
	},
	"unchecked": {
		type: "image/png",
		data: "iVBORw0KGgoAAAANSUhEUgAAAA0AAAAPCAYAAAA/I0V3AAAABGdBTUEAALGPC/xhBQAAAAlwSFlzAAAOwgAADsIBFShKgAAAABh0RVh0U29mdHdhcmUAcGFpbnQubmV0IDQuMC41ZYUyZQAAARBJREFUOE+9krtug1AQRPldSio7FQ1tZImOkoKOBomGT0EURC5ino54yTw90WywQhTkIkVWGoF2zuxdrlD+t0zThKZpT0Vmxb8CQRCg6zr0fb8rer7vfwcPxxdcrx+YpgnzPGNZlh9ibxxHlGUJshLSdV0at9tNpg7DIBrX5+OkPM9BVkKGYSBJEtR1jbZrBdiqbVtUVYU0TUFWQq+nE+I4xvvlImGaW7FHjwxZCVmWhbfzGVmWoSgKWXUr9uiRISshx3FkEldomubXauzRI0NWQp7nyUR+NG/rfr/jUXxnjx5vmKyEbNuWox9Xvid6ZMhK6HA4wnVdhGGIKIp2RY8MWQmx+JuoqvpUZFb8L6UonyYL3uOtrFH+AAAAAElFTkSuQmCC"
	},
	"up-down-spin": {
		type: "image/png",
		data: "iVBORw0KGgoAAAANSUhEUgAAAA4AAAAPCAYAAADUFP50AAAABGdBTUEAALGPC/xhBQAAAAlwSFlzAAAOwQAADsEBuJFr7QAAABh0RVh0U29mdHdhcmUAcGFpbnQubmV0IDQuMC41ZYUyZQAAAGJJREFUOE+lkwEKACEIBH2Zb/PnHsoGeaVJDUjGOgRRpKpkiIj+y4MME3eDR7kaKOVNsJyMNjIHzGy9YnW6J7qIcrriQimeCqORNABd0fpRTkt8uVUj7EsxC6vs/q3e/Q6iD2bwnByjPXHNAAAAAElFTkSuQmCC"
	},
	"up-down": {
		type: "image/png",
		data: "iVBORw0KGgoAAAANSUhEUgAAAA4AAAAPCAYAAADUFP50AAAABGdBTUEAALGPC/xhBQAAAAlwSFlzAAAOwQAADsEBuJFr7QAAABh0RVh0U29mdHdhcmUAcGFpbnQubmV0IDQuMC41ZYUyZQAAAGFJREFUOE+lkkEKQCEIRD2ZJ3Ph3iN4WD9GflpYhj0YYowpGgJmbikd3gjMDFokwbuT1iAiurG5nomgqo5QaPo9ERQRI6Jf7sfGjudy2je23+i0Wl2oQ85TOdlfrJQOazF8br+rqTXQKn0AAAAASUVORK5CYII="
	},
};

},{}],11:[function(require,module,exports){
/* eslint-env browser */

/**
 * This is a registry of `HTMLImageIcon` objects.
 *
 * Hypergrid comes with a few images (see below).
 *
 * Application developer is free to register additional image objects here (see {@link module:images.add|add}).
 * @module images
 */

'use strict';

var _ = require('object-iterators');

var images = require('./images'); // this is the file generated by gulpfile.js (and ignored by git)

/**
 * <img src="https://raw.githubusercontent.com/openfin/fin-hypergrid/master/images/calendar.png">
 * @name calendar
 * @memberOf module:images
 */

/**
 * <img src="https://raw.githubusercontent.com/openfin/fin-hypergrid/master/images/checked.png">
 * @name checked
 * @memberOf module:images
 */

/**
 * <img src="https://raw.githubusercontent.com/openfin/fin-hypergrid/master/images/unchecked.png">
 * @name unchecked
 * @memberOf module:images
 */

/**
 * <img src="https://raw.githubusercontent.com/openfin/fin-hypergrid/master/images/filter-off.png">
 * @name filter-off
 * @memberOf module:images
 */

/**
 * <img src="https://raw.githubusercontent.com/openfin/fin-hypergrid/master/images/filter-on.png">
 * @name filter-on
 * @memberOf module:images
 */

/**
 * <img src="https://raw.githubusercontent.com/openfin/fin-hypergrid/master/images/up-down.png">
 * @name up-down
 * @memberOf module:images
 */

_(images).each(function(image, key) {
    var element = new Image();
    element.src = 'data:' + image.type + ';base64,' + image.data;
    images[key] = element;
});

/**
 * Synonym of {@link module:images.checked|checked} (unaffected if `checked` overridden).
 * @name checkbox-on
 * @memberOf module:images
 */
images['checkbox-on'] = images.checked;

/**
 * Synonym of {@link module:images.unchecked|unchecked} (unaffected if `unchecked` overridden).
 * @name checkbox-off
 * @memberOf module:images
 */
images['checkbox-off'] = images.unchecked;

/**
 * @name add
 * @method
 * @param {string} key
 * @param {HTMLImageElement} img
 * @memberOf module:images
 */
images.add = function(key, img) {
    return images[key] = img;
};

/**
 * Convenience function.
 * @name checkbox
 * @method
 * @param {boolean} state
 * @returns {HTMLImageElement} {@link module:images.checked|checked} when `state` is truthy or {@link module:images.unchecked|unchecked} otherwise.
 * @memberOf module:images
 */
images.checkbox = function(state) {
    return images[state ? 'checked' : 'unchecked'];
};

/**
 * Convenience function.
 * @name filter
 * @method
 * @param {boolean} state
 * @returns {HTMLImageElement} {@link module:images.filter-off|filter-off} when `state` is truthy or {@link module:images.filter-on|filter-on} otherwise.
 * @memberOf module:images
 */
images.filter = function(state) {
    return images[state ? 'filter-on' : 'filter-off'];
};

module.exports = images;

},{"./images":10,"object-iterators":19}],12:[function(require,module,exports){
'use strict';

// This file in root folder allows an app under development in a sister folder to reference a local build
// of Hypergrid with "file://../fin-hypergrid" in it's package.json. (Still has to be npm install'd.)

module.exports = require('./src/Hypergrid');

},{"./src/Hypergrid":27}],13:[function(require,module,exports){
/* eslint-env browser */

'use strict';

/** @module automat */

var ENCODERS = /%\{(\d+)\}/g; // double $$ to encode

var REPLACERS = /\$\{(.*?)\}/g; // single $ to replace


/**
 * @summary String formatter.
 *
 * @desc String substitution is performed on numbered _replacer_ patterns like `${n}` or _encoder_ patterns like `%{n}` where n is the zero-based `arguments` index. So `${0}` would be replaced with the first argument following `text`.
 *
 * Encoders are just like replacers except the argument is HTML-encoded before being used.
 *
 * To change the format patterns, assign new `RegExp` patterns to `automat.encoders` and `automat.replacers`.
 *
 * @param {string|function} template - A template to be formatted as described above. Overloads:
 * * A string primitive containing the template.
 * * A function to be called with `this` as the calling context. The template is the value returned from this call.
 *
 * @param {...*} [replacements] - Replacement values for numbered format patterns.
 *
 * @return {string} The formatted text.
 *
 * @memberOf module:automat
 */
function automat(template, replacements/*...*/) {
    var hasReplacements = arguments.length > 1;

    // if `template` is a function, convert it to text
    if (typeof template === 'function') {
        template = template.call(this); // non-template function: call it with context and use return value
    }

    if (hasReplacements) {
        var args = arguments;
        template = template.replace(automat.replacersRegex, function(match, key) {
            key -= -1; // convert to number and increment
            return args.length > key ? args[key] : '';
        });

        template = template.replace(automat.encodersRegex, function(match, key) {
            key -= -1; // convert to number and increment
            if (args.length > key) {
                var htmlEncoderNode = document.createElement('DIV');
                htmlEncoderNode.textContent = args[key];
                return htmlEncoderNode.innerHTML;
            } else {
                return '';
            }
        });
    }

    return template;
}

/**
 * @summary Replace contents of `el` with `Nodes` generated from formatted template.
 *
 * @param {string|function} template - See `template` parameter of {@link automat}.
 *
 * @param {HTMLElement} [el] - Node in which to return markup generated from template. If omitted, a new `<div>...</div>` element will be created and returned.
 *
 * @param {...*} [replacements] - Replacement values for numbered format patterns.
 *
 * @return {HTMLElement} The `el` provided or a new `<div>...</div>` element, its `innerHTML` set to the formatted text.
 *
 * @memberOf module:automat
 */
function replace(template, el, replacements/*...*/) {
    var elOmitted = typeof el !== 'object',
        args = Array.prototype.slice.call(arguments, 1);

    if (elOmitted) {
        el = document.createElement('DIV');
        args.unshift(template);
    } else {
        args[0] = template;
    }

    el.innerHTML = automat.apply(null, args);

    return el;
}

/**
 * @summary Append or insert `Node`s generated from formatted template into given `el`.
 *
 * @param {string|function} template - See `template` parameter of {@link automat}.
 *
 * @param {HTMLElement} el
 *
 * @param {Node} [referenceNode=null] Inserts before this element within `el` or at end of `el` if `null`.
 *
 * @param {...*} [replacements] - Replacement values for numbered format patterns.
 *
 * @returns {Node[]} Array of the generated nodes (this is an actual Array instance; not an Array-like object).
 *
 * @memberOf module:automat
 */
function append(template, el, referenceNode, replacements/*...*/) {
    var replacementsStartAt = 3,
        referenceNodeOmitted = typeof referenceNode !== 'object';  // replacements are never objects

    if (referenceNodeOmitted) {
        referenceNode = null;
        replacementsStartAt = 2;
    }

    replacements = Array.prototype.slice.call(arguments, replacementsStartAt);
    var result = [],
        div = replace.apply(null, [template].concat(replacements));

    while (div.childNodes.length) {
        result.push(div.firstChild);
        el.insertBefore(div.firstChild, referenceNode); // removes child from div
    }

    return result;
}

/**
 * Use this convenience wrapper to return the first child node described in `template`.
 *
 * @param {string|function} template - If a function, extract template from comment within.
 *
 * @returns {HTMLElement} The first `Node` in your template.
 *
 * @memberOf module:automat
 */
function firstChild(template, replacements/*...*/) {
    return replace.apply(null, arguments).firstChild;
}

/**
 * Use this convenience wrapper to return the first child element described in `template`.
 *
 * @param {string|function} template - If a function, extract template from comment within.
 *
 * @returns {HTMLElement} The first `HTMLElement` in your template.
 *
 * @memberOf module:automat
 */
function firstElement(template, replacements/*...*/) {
    return replace.apply(null, arguments).firstElementChild;
}

/**
 * @summary Finds string substitution lexemes that require HTML encoding.
 * @desc Modify to suit.
 * @default %{n}
 * @type {RegExp}
 * @memberOf module:automat
 */
automat.encodersRegex = ENCODERS;

/**
 * @summary Finds string substitution lexemes.
 * @desc Modify to suit.
 * @default ${n}
 * @type {RegExp}
 * @memberOf module:automat
 */
automat.replacersRegex = REPLACERS;

automat.format = automat; // if you find using just `automat()` confusing
automat.replace = replace;
automat.append = append;
automat.firstChild = firstChild;
automat.firstElement = firstElement;

module.exports = automat;

},{}],14:[function(require,module,exports){
'use strict';

/* eslint-env browser */

/** @namespace cssInjector */

/**
 * @summary Insert base stylesheet into DOM
 *
 * @desc Creates a new `<style>...</style>` element from the named text string(s) and inserts it but only if it does not already exist in the specified container as per `referenceElement`.
 *
 * > Caveat: If stylesheet is for use in a shadow DOM, you must specify a local `referenceElement`.
 *
 * @returns A reference to the newly created `<style>...</style>` element.
 *
 * @param {string|string[]} cssRules
 * @param {string} [ID]
 * @param {undefined|null|Element|string} [referenceElement] - Container for insertion. Overloads:
 * * `undefined` type (or omitted): injects stylesheet at top of `<head>...</head>` element
 * * `null` value: injects stylesheet at bottom of `<head>...</head>` element
 * * `Element` type: injects stylesheet immediately before given element, wherever it is found.
 * * `string` type: injects stylesheet immediately before given first element found that matches the given css selector.
 *
 * @memberOf cssInjector
 */
function cssInjector(cssRules, ID, referenceElement) {
    if (typeof referenceElement === 'string') {
        referenceElement = document.querySelector(referenceElement);
        if (!referenceElement) {
            throw 'Cannot find reference element for CSS injection.';
        }
    } else if (referenceElement && !(referenceElement instanceof Element)) {
        throw 'Given value not a reference element.';
    }

    var container = referenceElement && referenceElement.parentNode || document.head || document.getElementsByTagName('head')[0];

    if (ID) {
        ID = cssInjector.idPrefix + ID;

        if (container.querySelector('#' + ID)) {
            return; // stylesheet already in DOM
        }
    }

    var style = document.createElement('style');
    style.type = 'text/css';
    if (ID) {
        style.id = ID;
    }
    if (cssRules instanceof Array) {
        cssRules = cssRules.join('\n');
    }
    cssRules = '\n' + cssRules + '\n';
    if (style.styleSheet) {
        style.styleSheet.cssText = cssRules;
    } else {
        style.appendChild(document.createTextNode(cssRules));
    }

    if (referenceElement === undefined) {
        referenceElement = container.firstChild;
    }

    container.insertBefore(style, referenceElement);

    return style;
}

/**
 * @summary Optional prefix for `<style>` tag IDs.
 * @desc Defaults to `'injected-stylesheet-'`.
 * @type {string}
 * @memberOf cssInjector
 */
cssInjector.idPrefix = 'injected-stylesheet-';

// Interface
module.exports = cssInjector;

},{}],15:[function(require,module,exports){
arguments[4][2][0].apply(exports,arguments)
},{"dup":2,"overrider":20}],16:[function(require,module,exports){
'use strict';

/* eslint-env node, browser */

var cssInjector = require('css-injector');

/**
 * @constructor FinBar
 * @summary Create a scrollbar object.
 * @desc Creating a scrollbar is a three-step process:
 *
 * 1. Instantiate the scrollbar object by calling this constructor function. Upon instantiation, the DOM element for the scrollbar (with a single child element for the scrollbar "thumb") is created but is not insert it into the DOM.
 * 2. After instantiation, it is the caller's responsibility to insert the scrollbar, {@link FinBar#bar|this.bar}, into the DOM.
 * 3. After insertion, the caller must call {@link FinBar#resize|resize()} at least once to size and position the scrollbar and its thumb. After that, `resize()` should also be called repeatedly on resize events (as the content element is being resized).
 *
 * Suggested configurations:
 * * _**Unbound**_<br/>
 * The scrollbar serves merely as a simple range (slider) control. Omit both `options.onchange` and `options.content`.
 * * _**Bound to virtual content element**_<br/>
 * Virtual content is projected into the element using a custom event handler supplied by the programmer in `options.onchange`. A typical use case would be to handle scrolling of the virtual content. Other use cases include data transformations, graphics transformations, _etc._
 * * _**Bound to real content**_<br/>
 * Set `options.content` to the "real" content element but omit `options.onchange`. This will cause the scrollbar to use the built-in event handler (`this.scrollRealContent`) which implements smooth scrolling of the content element within the container.
 *
 * @param {finbarOptions} [options={}] - Options object. See the type definition for member details.
 */
function FinBar(options) {

    // make bound versions of all the mouse event handler
    var bound = this._bound = {};
    for (key in handlersToBeBound) {
        bound[key] = handlersToBeBound[key].bind(this);
    }

    /**
     * @name thumb
     * @summary The generated scrollbar thumb element.
     * @desc The thumb element's parent element is always the {@link FinBar#bar|bar} element.
     *
     * This property is typically referenced internally only. The size and position of the thumb element is maintained by `_calcThumb()`.
     * @type {Element}
     * @memberOf FinBar.prototype
     */
    var thumb = this.thumb = document.createElement('div');
    thumb.classList.add('thumb');
    thumb.onclick = bound.shortStop;
    thumb.onmouseover = bound.onmouseover;
    thumb.onmouseout = this._bound.onmouseout;

    /**
     * @name bar
     * @summary The generated scrollbar element.
     * @desc The caller inserts this element into the DOM (typically into the content container) and then calls its {@link FinBar#resize|resize()} method.
     *
     * Thus the node tree is typically:
     * * A **content container** element, which contains:
     *   * The content element(s)
     *   * This **scrollbar element**, which in turn contains:
     *     * The **thumb element**
     *
     * @type {Element}
     * @memberOf FinBar.prototype
     */
    var bar = this.bar = document.createElement('div');
    bar.classList.add('finbar-vertical');
    bar.onmousedown = this._bound.onmousedown;
    if (this.paging) { bar.onclick = bound.onclick; }
    bar.appendChild(thumb);

    options = options || {};

    // presets
    this.orientation = 'vertical';
    this._min = this._index = 0;
    this._max = 100;

    // options
    for (var key in options) {
        if (options.hasOwnProperty(key)) {
            var option = options[key];
            switch (key) {

                case 'index':
                    this._index = option;
                    break;

                case 'range':
                    validRange(option);
                    this._min = option.min;
                    this._max = option.max;
                    this.contentSize = option.max - option.min + 1;
                    break;

                default:
                    if (
                        key.charAt(0) !== '_' &&
                        typeof FinBar.prototype[key] !== 'function'
                    ) {
                        // override prototype defaults for standard ;
                        // extend with additional properties (for use in onchange event handlers)
                        this[key] = option;
                    }
                    break;

            }
        }
    }

    cssInjector(cssFinBars, 'finbar-base', options.cssStylesheetReferenceElement);
}

FinBar.prototype = {

    /**
     * @summary The scrollbar orientation.
     * @desc Set by the constructor to either `'vertical'` or `'horizontal'`. See the similarly named property in the {@link finbarOptions} object.
     *
     * Useful values are `'vertical'` (the default) or `'horizontal'`.
     *
     * Setting this property resets `this.oh` and `this.deltaProp` and changes the class names so as to reposition the scrollbar as per the CSS rules for the new orientation.
     * @default 'vertical'
     * @type {string}
     * @memberOf FinBar.prototype
     */
    set orientation(orientation) {
        if (orientation === this._orientation) {
            return;
        }

        this._orientation = orientation;

        /**
         * @readonly
         * @name oh
         * @summary <u>O</u>rientation <u>h</u>ash for this scrollbar.
         * @desc Set by the `orientation` setter to either the vertical or the horizontal orientation hash. The property should always be synchronized with `orientation`; do not update directly!
         *
         * This object is used internally to access scrollbars' DOM element properties in a generalized way without needing to constantly query the scrollbar orientation. For example, instead of explicitly coding `this.bar.top` for a vertical scrollbar and `this.bar.left` for a horizontal scrollbar, simply code `this.bar[this.oh.leading]` instead. See the {@link orientationHashType} definition for details.
         *
         * This object is useful externally for coding generalized {@link finbarOnChange} event handler functions that serve both horizontal and vertical scrollbars.
         * @type {orientationHashType}
         * @memberOf FinBar.prototype
         */
        this.oh = orientationHashes[this._orientation];

        if (!this.oh) {
            error('Invalid value for `options._orientation.');
        }

        /**
         * @name deltaProp
         * @summary The name of the `WheelEvent` property this scrollbar should listen to.
         * @desc Set by the constructor. See the similarly named property in the {@link finbarOptions} object.
         *
         * Useful values are `'deltaX'`, `'deltaY'`, or `'deltaZ'`. A value of `null` means to ignore mouse wheel events entirely.
         *
         * The mouse wheel is one-dimensional and only emits events with `deltaY` data. This property is provided so that you can override the default of `'deltaX'` with a value of `'deltaY'` on your horizontal scrollbar primarily to accommodate certain "panoramic" interface designs where the mouse wheel should control horizontal rather than vertical scrolling. Just give `{ deltaProp: 'deltaY' }` in your horizontal scrollbar instantiation.
         *
         * Caveat: Note that a 2-finger drag on an Apple trackpad emits events with _both_ `deltaX ` and `deltaY` data so you might want to delay making the above adjustment until you can determine that you are getting Y data only with no X data at all (which is a sure bet you on a mouse wheel rather than a trackpad).

         * @type {object|null}
         * @memberOf FinBar.prototype
         */
        this.deltaProp = this.oh.delta;

        this.bar.className = this.bar.className.replace(/(vertical|horizontal)/g, orientation);

        if (this.bar.style.cssText || this.thumb.style.cssText) {
            this.bar.removeAttribute('style');
            this.thumb.removeAttribute('style');
            this.resize();
        }
    },
    get orientation() {
        return this._orientation;
    },

    /**
     * @summary Callback for scroll events.
     * @desc Set by the constructor via the similarly named property in the {@link finbarOptions} object. After instantiation, `this.onchange` may be updated directly.
     *
     * This event handler is called whenever the value of the scrollbar is changed through user interaction. The typical use case is when the content is scrolled. It is called with the `FinBar` object as its context and the current value of the scrollbar (its index, rounded) as the only parameter.
     *
     * Set this property to `null` to stop emitting such events.
     * @type {function(number)|null}
     * @memberOf FinBar.prototype
     */
    onchange: null,

    /**
     * @summary Add a CSS class name to the bar element's class list.
     * @desc Set by the constructor. See the similarly named property in the {@link finbarOptions} object.
     *
     * The bar element's class list will always include `finbar-vertical` (or `finbar-horizontal` based on the current orientation). Whenever this property is set to some value, first the old prefix+orientation is removed from the bar element's class list; then the new prefix+orientation is added to the bar element's class list. This property causes _an additional_ class name to be added to the bar element's class list. Therefore, this property will only add at most one additional class name to the list.
     *
     * To remove _classname-orientation_ from the bar element's class list, set this property to a falsy value, such as `null`.
     *
     * > NOTE: You only need to specify an additional class name when you need to have mulltiple different styles of scrollbars on the same page. If this is not a requirement, then you don't need to make a new class; you would just create some additional rules using the same selectors in the built-in stylesheet (../css/finbars.css):
     * *`div.finbar-vertical` (or `div.finbar-horizontal`) for the scrollbar
     * *`div.finbar-vertical > div` (or `div.finbar-horizontal > div`) for the "thumb."
     *
     * Of course, your rules should come after the built-ins.
     * @type {string}
     * @memberOf FinBar.prototype
     */
    set classPrefix(prefix) {
        if (this._classPrefix) {
            this.bar.classList.remove(this._classPrefix + this.orientation);
        }

        this._classPrefix = prefix;

        if (prefix) {
            this.bar.classList.add(prefix + '-' + this.orientation);
        }
    },
    get classPrefix() {
        return this._classPrefix;
    },

    /**
     * @name increment
     * @summary Number of scrollbar index units representing a pageful. Used exclusively for paging up and down and for setting thumb size relative to content size.
     * @desc Set by the constructor. See the similarly named property in the {@link finbarOptions} object.
     *
     * Can also be given as a parameter to the {@link FinBar#resize|resize} method, which is pertinent because content area size changes affect the definition of a "pageful." However, you only need to do this if this value is being used. It not used when:
     * * you define `paging.up` and `paging.down`
     * * your scrollbar is using `scrollRealContent`
     * @type {number}
     * @memberOf FinBar.prototype
     */
    increment: 1,

    /**
     * @name barStyles
     * @summary Scrollbar styles to be applied by {@link FinBar#resize|resize()}.
     * @desc Set by the constructor. See the similarly named property in the {@link finbarOptions} object.
     *
     * This is a value to be assigned to {@link FinBar#styles|styles} on each call to {@link FinBar#resize|resize()}. That is, a hash of values to be copied to the scrollbar element's style object on resize; or `null` for none.
     *
     * @see {@link FinBar#style|style}
     * @type {finbarStyles|null}
     * @memberOf FinBar.prototype
     */
    barStyles: null,

    /**
     * @name style
     * @summary Additional scrollbar styles.
     * @desc See type definition for more details. These styles are applied directly to the scrollbar's `bar` element.
     *
     * Values are adjusted as follows before being applied to the element:
     * 1. Included "pseudo-property" names from the scrollbar's orientation hash, {@link FinBar#oh|oh}, are translated to actual property names before being applied.
     * 2. When there are margins, percentages are translated to absolute pixel values because CSS ignores margins in its percentage calculations.
     * 3. If you give a value without a unit (a raw number), "px" unit is appended.
     *
     * General notes:
     * 1. It is always preferable to specify styles via a stylesheet. Only set this property when you need to specifically override (a) stylesheet value(s).
     * 2. Can be set directly or via calls to the {@link FinBar#resize|resize} method.
     * 3. Should only be set after the scrollbar has been inserted into the DOM.
     * 4. Before applying these new values to the element, _all_ in-line style values are reset (by removing the element's `style` attribute), exposing inherited values (from stylesheets).
     * 5. Empty object has no effect.
     * 6. Falsey value in place of object has no effect.
     *
     * > CAVEAT: Do not attempt to treat the object you assign to this property as if it were `this.bar.style`. Specifically, changing this object after assigning it will have no effect on the scrollbar. You must assign it again if you want it to have an effect.
     *
     * @see {@link FinBar#barStyles|barStyles}
     * @type {finbarStyles}
     * @memberOf FinBar.prototype
     */
    set style(styles) {
        var keys = Object.keys(styles = extend({}, styles, this._auxStyles));

        if (keys.length) {
            var bar = this.bar,
                barRect = bar.getBoundingClientRect(),
                container = this.container || bar.parentElement,
                containerRect = container.getBoundingClientRect(),
                oh = this.oh;

            // Before applying new styles, revert all styles to values inherited from stylesheets
            bar.removeAttribute('style');

            keys.forEach(function (key) {
                var val = styles[key];

                if (key in oh) {
                    key = oh[key];
                }

                if (!isNaN(Number(val))) {
                    val = (val || 0) + 'px';
                } else if (/%$/.test(val)) {
                    // When bar size given as percentage of container, if bar has margins, restate size in pixels less margins.
                    // (If left as percentage, CSS's calculation will not exclude margins.)
                    var oriented = axis[key],
                        margins = barRect[oriented.marginLeading] + barRect[oriented.marginTrailing];
                    if (margins) {
                        val = parseInt(val, 10) / 100 * containerRect[oriented.size] - margins + 'px';
                    }
                }

                bar.style[key] = val;
            });
        }
    },

    /**
     * @readonly
     * @name paging
     * @summary Enable page up/dn clicks.
     * @desc Set by the constructor. See the similarly named property in the {@link finbarOptions} object.
     *
     * If truthy, listen for clicks in page-up and page-down regions of scrollbar.
     *
     * If an object, call `.paging.up()` on page-up clicks and `.paging.down()` will be called on page-down clicks.
     *
     * Changing the truthiness of this value after instantiation currently has no effect.
     * @type {boolean|object}
     * @memberOf FinBar.prototype
     */
    paging: true,

    /**
     * @name range
     * @summary Setter for the minimum and maximum scroll values.
     * @desc Set by the constructor. These values are the limits for {@link FooBar#index|index}.
     *
     * The setter accepts an object with exactly two numeric properties: `.min` which must be less than `.max`. The values are extracted and the object is discarded.
     *
     * The getter returns a new object with `.min` and '.max`.
     *
     * @type {rangeType}
     * @memberOf FinBar.prototype
     */
    set range(range) {
        validRange(range);
        this._min = range.min;
        this._max = range.max;
        this.contentSize = range.max - range.min + 1;
        this.index = this.index; // re-clamp
    },
    get range() {
        return {
            min: this._min,
            max: this._max
        };
    },

    /**
     * @summary Index value of the scrollbar.
     * @desc This is the position of the scroll thumb.
     *
     * Setting this value clamps it to {@link FinBar#min|min}..{@link FinBar#max|max}, scroll the content, and moves thumb.
     *
     * Getting this value returns the current index. The returned value will be in the range `min`..`max`. It is intentionally not rounded.
     *
     * Use this value as an alternative to (or in addition to) using the {@link FinBar#onchange|onchange} callback function.
     *
     * @see {@link FinBar#_setScroll|_setScroll}
     * @type {number}
     * @memberOf FinBar.prototype
     */
    set index(idx) {
        idx = Math.min(this._max, Math.max(this._min, idx)); // clamp it
        this._setScroll(idx);
        // this._setThumbSize();
    },
    get index() {
        return this._index;
    },

    /**
     * @private
     * @summary Move the thumb.
     * @desc Also displays the index value in the test panel and invokes the callback.
     * @param idx - The new scroll index, a value in the range `min`..`max`.
     * @param [scaled=f(idx)] - The new thumb position in pixels and scaled relative to the containing {@link FinBar#bar|bar} element, i.e., a proportional number in the range `0`..`thumbMax`. When omitted, a function of `idx` is used.
     * @memberOf FinBar.prototype
     */
    _setScroll: function (idx, scaled) {
        this._index = idx;

        // Display the index value in the test panel
        if (this.testPanelItem && this.testPanelItem.index instanceof Element) {
            this.testPanelItem.index.innerHTML = Math.round(idx);
        }

        // Call the callback
        if (this.onchange) {
            this.onchange.call(this, Math.round(idx));
        }

        // Move the thumb
        if (scaled === undefined) {
            scaled = (idx - this._min) / (this._max - this._min) * this._thumbMax;
        }
        this.thumb.style[this.oh.leading] = scaled + 'px';
    },

    scrollRealContent: function (idx) {
        var containerRect = this.content.parentElement.getBoundingClientRect(),
            sizeProp = this.oh.size,
            maxScroll = Math.max(0, this.content[sizeProp] - containerRect[sizeProp]),
            //scroll = Math.min(idx, maxScroll);
            scroll = (idx - this._min) / (this._max - this._min) * maxScroll;
        //console.log('scroll: ' + scroll);
        this.content.style[this.oh.leading] = -scroll + 'px';
    },

    /**
     * @summary Recalculate thumb position.
     *
     * @desc This method recalculates the thumb size and position. Call it once after inserting your scrollbar into the DOM, and repeatedly while resizing the scrollbar (which typically happens when the scrollbar's parent is resized by user.
     *
     * > This function shifts args if first arg omitted.
     *
     * @param {number} [increment=this.increment] - Resets {@link FooBar#increment|increment} (see).
     *
     * @param {finbarStyles} [barStyles=this.barStyles] - (See type definition for details.) Scrollbar styles to be applied to the bar element.
     *
     * Only specify a `barStyles` object when you need to override stylesheet values. If provided, becomes the new default (`this.barStyles`), for use as a default on subsequent calls.
     *
     * It is generally the case that the scrollbar's new position is sufficiently described by the current styles. Therefore, it is unusual to need to provide a `barStyles` object on every call to `resize`.
     *
     * @returns {FinBar} Self for chaining.
     * @memberOf FinBar.prototype
     */
    resize: function (increment, barStyles) {
        var bar = this.bar;

        if (!bar.parentNode) {
            return; // not in DOM yet so nothing to do
        }

        var container = this.container || bar.parentElement,
            containerRect = container.getBoundingClientRect();

        // shift args if if 1st arg omitted
        if (typeof increment === 'object') {
            barStyles = increment;
            increment = undefined;
        }

        this.style = this.barStyles = barStyles || this.barStyles;

        // Bound to real content: Content was given but no onchange handler.
        // Set up .onchange, .containerSize, and .increment.
        // Note this only makes sense if your index unit is pixels.
        if (this.content) {
            if (!this.onchange) {
                this.onchange = this.scrollRealContent;
                this.contentSize = this.content[this.oh.size];
                this._min = 0;
                this._max = this.contentSize - 1;
            }
        }
        if (this.onchange === this.scrollRealContent) {
            this.containerSize = containerRect[this.oh.size];
            this.increment = this.containerSize / (this.contentSize - this.containerSize) * (this._max - this._min);
        } else {
            this.containerSize = 1;
            this.increment = increment || this.increment;
        }

        var index = this.index;
        this.testPanelItem = this.testPanelItem || this._addTestPanelItem();
        this._setThumbSize();
        this.index = index;

        if (this.deltaProp !== null) {
            container.addEventListener('wheel', this._bound.onwheel);
        }

        return this;
    },

    /**
     * @summary Shorten trailing end of scrollbar by thickness of some other scrollbar.
     * @desc In the "classical" scenario where vertical scroll bar is on the right and horizontal scrollbar is on the bottom, you want to shorten the "trailing end" (bottom and right ends, respectively) of at least one of them so they don't overlay.
     *
     * This convenience function is an programmatic alternative to hardcoding the correct style with the correct value in your stylesheet; or setting the correct style with the correct value in the {@link FinBar#barStyles|barStyles} object.
     *
     * @see {@link FinBar#foreshortenBy|foreshortenBy}.
     *
     * @param {FinBar|null} otherFinBar - Other scrollbar to avoid by shortening this one; `null` removes the trailing space
     * @returns {FinBar} For chaining
     */
    shortenBy: function (otherFinBar) { return this.shortenEndBy('trailing', otherFinBar); },

    /**
     * @summary Shorten leading end of scrollbar by thickness of some other scrollbar.
     * @desc Supports non-classical scrollbar scenarios where vertical scroll bar may be on left and horizontal scrollbar may be on top, in which case you want to shorten the "leading end" rather than the trailing end.
     * @see {@link FinBar#shortenBy|shortenBy}.
     * @param {FinBar|null} otherFinBar - Other scrollbar to avoid by shortening this one; `null` removes the trailing space
     * @returns {FinBar} For chaining
     */
    foreshortenBy: function (otherFinBar) { return this.shortenEndBy('leading', otherFinBar); },

    /**
     * @summary Generalized shortening function.
     * @see {@link FinBar#shortenBy|shortenBy}.
     * @see {@link FinBar#foreshortenBy|foreshortenBy}.
     * @param {string} whichEnd - a CSS style property name or an orientation hash name that translates to a CSS style property name.
     * @param {FinBar|null} otherFinBar - Other scrollbar to avoid by shortening this one; `null` removes the trailing space
     * @returns {FinBar} For chaining
     */
    shortenEndBy: function (whichEnd, otherFinBar) {
        if (!otherFinBar) {
            delete this._auxStyles;
        } else if (otherFinBar instanceof FinBar && otherFinBar.orientation !== this.orientation) {
            var otherStyle = window.getComputedStyle(otherFinBar.bar),
                ooh = orientationHashes[otherFinBar.orientation];
            this._auxStyles = {};
            this._auxStyles[whichEnd] = otherStyle[ooh.thickness];
        }
        return this; // for chaining
    },

    /**
     * @private
     * @summary Sets the proportional thumb size and hides thumb when 100%.
     * @desc The thumb size has an absolute minimum of 20 (pixels).
     * @memberOf FinBar.prototype
     */
    _setThumbSize: function () {
        var oh = this.oh,
            thumbComp = window.getComputedStyle(this.thumb),
            thumbMarginLeading = parseInt(thumbComp[oh.marginLeading]),
            thumbMarginTrailing = parseInt(thumbComp[oh.marginTrailing]),
            thumbMargins = thumbMarginLeading + thumbMarginTrailing,
            barSize = this.bar.getBoundingClientRect()[oh.size],
            thumbSize = Math.max(20, barSize * this.containerSize / this.contentSize);

        if (this.containerSize < this.contentSize) {
            this.bar.style.visibility = 'visible';
            this.thumb.style[oh.size] = thumbSize + 'px';
        } else {
            this.bar.style.visibility = 'hidden';
        }

        /**
         * @private
         * @name _thumbMax
         * @summary Maximum offset of thumb's leading edge.
         * @desc This is the pixel offset within the scrollbar of the thumb when it is at its maximum position at the extreme end of its range.
         *
         * This value takes into account the newly calculated size of the thumb element (including its margins) and the inner size of the scrollbar (the thumb's containing element, including _its_ margins).
         *
         * NOTE: Scrollbar padding is not taken into account and assumed to be 0 in the current implementation and is assumed to be `0`; use thumb margins in place of scrollbar padding.
         * @type {number}
         * @memberOf FinBar.prototype
         */
        this._thumbMax = barSize - thumbSize - thumbMargins;

        this._thumbMarginLeading = thumbMarginLeading; // used in mousedown
    },

    /**
     * @summary Remove the scrollbar.
     * @desc Unhooks all the event handlers and then removes the element from the DOM. Always call this method prior to disposing of the scrollbar object.
     * @memberOf FinBar.prototype
     */
    remove: function () {
        this.bar.onmousedown = null;
        this._removeEvt('mousemove');
        this._removeEvt('mouseup');

        (this.container || this.bar.parentElement)._removeEvt('wheel', this._bound.onwheel);

        this.bar.onclick =
            this.thumb.onclick =
                this.thumb.onmouseover =
                    this.thumb.transitionend =
                        this.thumb.onmouseout = null;

        this.bar.remove();
    },

    /**
     * @private
     * @function _addTestPanelItem
     * @summary Append a test panel element.
     * @desc If there is a test panel in the DOM (typically an `<ol>...</ol>` element) with class names of both `this.classPrefix` and `'test-panel'` (or, barring that, any element with class name `'test-panel'`), an `<li>...</li>` element will be created and appended to it. This new element will contain a span for each class name given.
     *
     * You should define a CSS selector `.listening` for these spans. This class will be added to the spans to alter their appearance when a listener is added with that class name (prefixed with 'on').
     *
     * (This is an internal function that is called once by the constructor on every instantiation.)
     * @returns {Element|undefined} The appended `<li>...</li>` element or `undefined` if there is no test panel.
     * @memberOf FinBar.prototype
     */
    _addTestPanelItem: function () {
        var testPanelItem,
            testPanelElement = document.querySelector('.' + this._classPrefix + '.test-panel') || document.querySelector('.test-panel');

        if (testPanelElement) {
            var testPanelItemPartNames = [ 'mousedown', 'mousemove', 'mouseup', 'index' ],
                item = document.createElement('li');

            testPanelItemPartNames.forEach(function (partName) {
                item.innerHTML += '<span class="' + partName + '">' + partName.replace('mouse', '') + '</span>';
            });

            testPanelElement.appendChild(item);

            testPanelItem = {};
            testPanelItemPartNames.forEach(function (partName) {
                testPanelItem[partName] = item.getElementsByClassName(partName)[0];
            });
        }

        return testPanelItem;
    },

    _addEvt: function (evtName) {
        var spy = this.testPanelItem && this.testPanelItem[evtName];
        if (spy) { spy.classList.add('listening'); }
        window.addEventListener(evtName, this._bound['on' + evtName]);
    },

    _removeEvt: function (evtName) {
        var spy = this.testPanelItem && this.testPanelItem[evtName];
        if (spy) { spy.classList.remove('listening'); }
        window.removeEventListener(evtName, this._bound['on' + evtName]);
    }
};

function extend(obj) {
    for (var i = 1; i < arguments.length; ++i) {
        var objn = arguments[i];
        if (objn) {
            for (var key in objn) {
                obj[key] = objn[key];
            }
        }
    }
    return obj;
}

function validRange(range) {
    var keys = Object.keys(range),
        valid =  keys.length === 2 &&
            typeof range.min === 'number' &&
            typeof range.max === 'number' &&
            range.min <= range.max;

    if (!valid) {
        error('Invalid .range object.');
    }
}

/**
 * @private
 * @name handlersToBeBound
 * @type {object}
 * @desc The functions defined in this object are all DOM event handlers that are bound by the FinBar constructor to each new instance. In other words, the `this` value of these handlers, once bound, refer to the FinBar object and not to the event emitter. "Do not consume raw."
 */
var handlersToBeBound = {
    shortStop: function (evt) {
        evt.stopPropagation();
    },

    onwheel: function (evt) {
        this.index += evt[this.deltaProp];
        evt.stopPropagation();
        evt.preventDefault();
    },

    onclick: function (evt) {
        var thumbBox = this.thumb.getBoundingClientRect(),
            goingUp = evt[this.oh.coordinate] < thumbBox[this.oh.leading];

        if (typeof this.paging === 'object') {
            this.index = this.paging[goingUp ? 'up' : 'down'](Math.round(this.index));
        } else {
            this.index += goingUp ? -this.increment : this.increment;
        }

        // make the thumb glow momentarily
        this.thumb.classList.add('hover');
        var self = this;
        this.thumb.addEventListener('transitionend', function waitForIt() {
            this.removeEventListener('transitionend', waitForIt);
            self._bound.onmouseup(evt);
        });

        evt.stopPropagation();
    },

    onmouseover: function () {
        this.thumb.classList.add('hover');
    },

    onmouseout: function () {
        this.thumb.classList.remove('hover');
    },

    onmousedown: function (evt) {
        var thumbBox = this.thumb.getBoundingClientRect();
        this.pinOffset = evt[this.oh.axis] - thumbBox[this.oh.leading] + this.bar.getBoundingClientRect()[this.oh.leading] + this._thumbMarginLeading;
        document.documentElement.style.cursor = 'default';

        this._addEvt('mousemove');
        this._addEvt('mouseup');

        evt.stopPropagation();
        evt.preventDefault();
    },

    onmousemove: function (evt) {
        var scaled = Math.min(this._thumbMax, Math.max(0, evt[this.oh.axis] - this.pinOffset));
        var idx = scaled / this._thumbMax * (this._max - this._min) + this._min;

        this._setScroll(idx, scaled);

        evt.stopPropagation();
        evt.preventDefault();
    },

    onmouseup: function (evt) {
        this._removeEvt('mousemove');
        this._removeEvt('mouseup');

        document.documentElement.style.cursor = 'auto';

        var thumbBox = this.thumb.getBoundingClientRect();
        if (
            thumbBox.left <= evt.clientX && evt.clientX <= thumbBox.right &&
            thumbBox.top <= evt.clientY && evt.clientY <= thumbBox.bottom
        ) {
            this._bound.onmouseover(evt);
        } else {
            this._bound.onmouseout(evt);
        }

        evt.stopPropagation();
        evt.preventDefault();
    }
};

var orientationHashes = {
    vertical: {
        coordinate:     'clientY',
        axis:           'pageY',
        size:           'height',
        outside:        'right',
        inside:         'left',
        leading:        'top',
        trailing:       'bottom',
        marginLeading:  'marginTop',
        marginTrailing: 'marginBottom',
        thickness:      'width',
        delta:          'deltaY'
    },
    horizontal: {
        coordinate:     'clientX',
        axis:           'pageX',
        size:           'width',
        outside:        'bottom',
        inside:         'top',
        leading:        'left',
        trailing:       'right',
        marginLeading:  'marginLeft',
        marginTrailing: 'marginRight',
        thickness:      'height',
        delta:          'deltaX'
    }
};

var axis = {
    top:    'vertical',
    bottom: 'vertical',
    height: 'vertical',
    left:   'horizontal',
    right:  'horizontal',
    width:  'horizontal'
};

var cssFinBars; // definition inserted by gulpfile between following comments
/* inject:css */
cssFinBars = 'div.finbar-horizontal,div.finbar-vertical{position:absolute;margin:3px}div.finbar-horizontal>.thumb,div.finbar-vertical>.thumb{position:absolute;background-color:#d3d3d3;-webkit-box-shadow:0 0 1px #000;-moz-box-shadow:0 0 1px #000;box-shadow:0 0 1px #000;border-radius:4px;margin:2px;opacity:.4;transition:opacity .5s}div.finbar-horizontal>.thumb.hover,div.finbar-vertical>.thumb.hover{opacity:1;transition:opacity .5s}div.finbar-vertical{top:0;bottom:0;right:0;width:11px}div.finbar-vertical>.thumb{top:0;right:0;width:7px}div.finbar-horizontal{left:0;right:0;bottom:0;height:11px}div.finbar-horizontal>.thumb{left:0;bottom:0;height:7px}';
/* endinject */

function error(msg) {
    throw 'finbars: ' + msg;
}

// Interface
module.exports = FinBar;

},{"css-injector":14}],17:[function(require,module,exports){
/* eslint-env browser */

'use strict';

var automat = require('automat');

/**
 * @summary Injects the named stylesheet into `<head>`.
 * @desc Stylesheets are inserted consecutively at end of `<head>` unless `before === true` (or omitted and `injectStylesheetTemplate.before` truthy) in which case they are inserted consecutively before first stylesheet found in `<head>` (if any) at load time.
 *
 * The calling context (`this`) is a stylesheet registry.
 * If `this` is undefined, the global stylesheet registry (css/index.js) is used.
 * @this {object}
 * @param {boolean} [before=injectStylesheetTemplate.before] - Add stylesheet before intially loaded stylesheets.
 *
 * _If omitted:_
 * 1. `id` is promoted to first argument position
 * 2. `injectStylesheetTemplate.before` is `true` by default
 * @param {string} id - The name of the style sheet in `this`, a stylesheet "registry" (hash of stylesheets).
 * @returns {Element|*}
 */
function injectStylesheetTemplate(before, id) {
    var optionalArgsStartAt, stylesheet, head, refNode, css, args,
        prefix = injectStylesheetTemplate.prefix;

    if (typeof before === 'boolean') {
        optionalArgsStartAt = 2;
    } else {
        id = before;
        before = injectStylesheetTemplate.before;
        optionalArgsStartAt = 1;
    }

    stylesheet = document.getElementById(prefix + id);

    if (!stylesheet) {
        head = document.querySelector('head');

        if (before) {
            // note position of first stylesheet
            refNode = Array.prototype.slice.call(head.children).find(function(child) {
                var id = child.getAttribute('id');
                return child.tagName === 'STYLE' && (!id || id.indexOf(prefix) !== prefix) ||
                    child.tagName === 'LINK' && child.getAttribute('rel') === 'stylesheet';
            });
        }

        css = this[id];

        if (!css) {
            throw 'Expected to find member `' + id + '` in calling context.';
        }

        args = [
            '<style>\n' + css + '\n</style>\n',
            head,
            refNode || null // explicitly null per https://developer.mozilla.org/en-US/docs/Web/API/Node/insertBefore
        ];

        if (arguments.length > 1) {
            args = args.concat(Array.prototype.slice.call(arguments, optionalArgsStartAt));
        }

        stylesheet = automat.append.apply(null, args)[0];
        stylesheet.id = prefix + id;
    }

    return stylesheet;
}

injectStylesheetTemplate.before = true;
injectStylesheetTemplate.prefix = 'injected-stylesheet-';

module.exports = injectStylesheetTemplate;

},{"automat":13}],18:[function(require,module,exports){
/*!
 * mustache.js - Logic-less {{mustache}} templates with JavaScript
 * http://github.com/janl/mustache.js
 */

/*global define: false Mustache: true*/

(function defineMustache (global, factory) {
  if (typeof exports === 'object' && exports && typeof exports.nodeName !== 'string') {
    factory(exports); // CommonJS
  } else if (typeof define === 'function' && define.amd) {
    define(['exports'], factory); // AMD
  } else {
    global.Mustache = {};
    factory(global.Mustache); // script, wsh, asp
  }
}(this, function mustacheFactory (mustache) {

  var objectToString = Object.prototype.toString;
  var isArray = Array.isArray || function isArrayPolyfill (object) {
    return objectToString.call(object) === '[object Array]';
  };

  function isFunction (object) {
    return typeof object === 'function';
  }

  /**
   * More correct typeof string handling array
   * which normally returns typeof 'object'
   */
  function typeStr (obj) {
    return isArray(obj) ? 'array' : typeof obj;
  }

  function escapeRegExp (string) {
    return string.replace(/[\-\[\]{}()*+?.,\\\^$|#\s]/g, '\\$&');
  }

  /**
   * Null safe way of checking whether or not an object,
   * including its prototype, has a given property
   */
  function hasProperty (obj, propName) {
    return obj != null && typeof obj === 'object' && (propName in obj);
  }

  // Workaround for https://issues.apache.org/jira/browse/COUCHDB-577
  // See https://github.com/janl/mustache.js/issues/189
  var regExpTest = RegExp.prototype.test;
  function testRegExp (re, string) {
    return regExpTest.call(re, string);
  }

  var nonSpaceRe = /\S/;
  function isWhitespace (string) {
    return !testRegExp(nonSpaceRe, string);
  }

  var entityMap = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
    '/': '&#x2F;',
    '`': '&#x60;',
    '=': '&#x3D;'
  };

  function escapeHtml (string) {
    return String(string).replace(/[&<>"'`=\/]/g, function fromEntityMap (s) {
      return entityMap[s];
    });
  }

  var whiteRe = /\s*/;
  var spaceRe = /\s+/;
  var equalsRe = /\s*=/;
  var curlyRe = /\s*\}/;
  var tagRe = /#|\^|\/|>|\{|&|=|!/;

  /**
   * Breaks up the given `template` string into a tree of tokens. If the `tags`
   * argument is given here it must be an array with two string values: the
   * opening and closing tags used in the template (e.g. [ "<%", "%>" ]). Of
   * course, the default is to use mustaches (i.e. mustache.tags).
   *
   * A token is an array with at least 4 elements. The first element is the
   * mustache symbol that was used inside the tag, e.g. "#" or "&". If the tag
   * did not contain a symbol (i.e. {{myValue}}) this element is "name". For
   * all text that appears outside a symbol this element is "text".
   *
   * The second element of a token is its "value". For mustache tags this is
   * whatever else was inside the tag besides the opening symbol. For text tokens
   * this is the text itself.
   *
   * The third and fourth elements of the token are the start and end indices,
   * respectively, of the token in the original template.
   *
   * Tokens that are the root node of a subtree contain two more elements: 1) an
   * array of tokens in the subtree and 2) the index in the original template at
   * which the closing tag for that section begins.
   */
  function parseTemplate (template, tags) {
    if (!template)
      return [];

    var sections = [];     // Stack to hold section tokens
    var tokens = [];       // Buffer to hold the tokens
    var spaces = [];       // Indices of whitespace tokens on the current line
    var hasTag = false;    // Is there a {{tag}} on the current line?
    var nonSpace = false;  // Is there a non-space char on the current line?

    // Strips all whitespace tokens array for the current line
    // if there was a {{#tag}} on it and otherwise only space.
    function stripSpace () {
      if (hasTag && !nonSpace) {
        while (spaces.length)
          delete tokens[spaces.pop()];
      } else {
        spaces = [];
      }

      hasTag = false;
      nonSpace = false;
    }

    var openingTagRe, closingTagRe, closingCurlyRe;
    function compileTags (tagsToCompile) {
      if (typeof tagsToCompile === 'string')
        tagsToCompile = tagsToCompile.split(spaceRe, 2);

      if (!isArray(tagsToCompile) || tagsToCompile.length !== 2)
        throw new Error('Invalid tags: ' + tagsToCompile);

      openingTagRe = new RegExp(escapeRegExp(tagsToCompile[0]) + '\\s*');
      closingTagRe = new RegExp('\\s*' + escapeRegExp(tagsToCompile[1]));
      closingCurlyRe = new RegExp('\\s*' + escapeRegExp('}' + tagsToCompile[1]));
    }

    compileTags(tags || mustache.tags);

    var scanner = new Scanner(template);

    var start, type, value, chr, token, openSection;
    while (!scanner.eos()) {
      start = scanner.pos;

      // Match any text between tags.
      value = scanner.scanUntil(openingTagRe);

      if (value) {
        for (var i = 0, valueLength = value.length; i < valueLength; ++i) {
          chr = value.charAt(i);

          if (isWhitespace(chr)) {
            spaces.push(tokens.length);
          } else {
            nonSpace = true;
          }

          tokens.push([ 'text', chr, start, start + 1 ]);
          start += 1;

          // Check for whitespace on the current line.
          if (chr === '\n')
            stripSpace();
        }
      }

      // Match the opening tag.
      if (!scanner.scan(openingTagRe))
        break;

      hasTag = true;

      // Get the tag type.
      type = scanner.scan(tagRe) || 'name';
      scanner.scan(whiteRe);

      // Get the tag value.
      if (type === '=') {
        value = scanner.scanUntil(equalsRe);
        scanner.scan(equalsRe);
        scanner.scanUntil(closingTagRe);
      } else if (type === '{') {
        value = scanner.scanUntil(closingCurlyRe);
        scanner.scan(curlyRe);
        scanner.scanUntil(closingTagRe);
        type = '&';
      } else {
        value = scanner.scanUntil(closingTagRe);
      }

      // Match the closing tag.
      if (!scanner.scan(closingTagRe))
        throw new Error('Unclosed tag at ' + scanner.pos);

      token = [ type, value, start, scanner.pos ];
      tokens.push(token);

      if (type === '#' || type === '^') {
        sections.push(token);
      } else if (type === '/') {
        // Check section nesting.
        openSection = sections.pop();

        if (!openSection)
          throw new Error('Unopened section "' + value + '" at ' + start);

        if (openSection[1] !== value)
          throw new Error('Unclosed section "' + openSection[1] + '" at ' + start);
      } else if (type === 'name' || type === '{' || type === '&') {
        nonSpace = true;
      } else if (type === '=') {
        // Set the tags for the next time around.
        compileTags(value);
      }
    }

    // Make sure there are no open sections when we're done.
    openSection = sections.pop();

    if (openSection)
      throw new Error('Unclosed section "' + openSection[1] + '" at ' + scanner.pos);

    return nestTokens(squashTokens(tokens));
  }

  /**
   * Combines the values of consecutive text tokens in the given `tokens` array
   * to a single token.
   */
  function squashTokens (tokens) {
    var squashedTokens = [];

    var token, lastToken;
    for (var i = 0, numTokens = tokens.length; i < numTokens; ++i) {
      token = tokens[i];

      if (token) {
        if (token[0] === 'text' && lastToken && lastToken[0] === 'text') {
          lastToken[1] += token[1];
          lastToken[3] = token[3];
        } else {
          squashedTokens.push(token);
          lastToken = token;
        }
      }
    }

    return squashedTokens;
  }

  /**
   * Forms the given array of `tokens` into a nested tree structure where
   * tokens that represent a section have two additional items: 1) an array of
   * all tokens that appear in that section and 2) the index in the original
   * template that represents the end of that section.
   */
  function nestTokens (tokens) {
    var nestedTokens = [];
    var collector = nestedTokens;
    var sections = [];

    var token, section;
    for (var i = 0, numTokens = tokens.length; i < numTokens; ++i) {
      token = tokens[i];

      switch (token[0]) {
        case '#':
        case '^':
          collector.push(token);
          sections.push(token);
          collector = token[4] = [];
          break;
        case '/':
          section = sections.pop();
          section[5] = token[2];
          collector = sections.length > 0 ? sections[sections.length - 1][4] : nestedTokens;
          break;
        default:
          collector.push(token);
      }
    }

    return nestedTokens;
  }

  /**
   * A simple string scanner that is used by the template parser to find
   * tokens in template strings.
   */
  function Scanner (string) {
    this.string = string;
    this.tail = string;
    this.pos = 0;
  }

  /**
   * Returns `true` if the tail is empty (end of string).
   */
  Scanner.prototype.eos = function eos () {
    return this.tail === '';
  };

  /**
   * Tries to match the given regular expression at the current position.
   * Returns the matched text if it can match, the empty string otherwise.
   */
  Scanner.prototype.scan = function scan (re) {
    var match = this.tail.match(re);

    if (!match || match.index !== 0)
      return '';

    var string = match[0];

    this.tail = this.tail.substring(string.length);
    this.pos += string.length;

    return string;
  };

  /**
   * Skips all text until the given regular expression can be matched. Returns
   * the skipped string, which is the entire tail if no match can be made.
   */
  Scanner.prototype.scanUntil = function scanUntil (re) {
    var index = this.tail.search(re), match;

    switch (index) {
      case -1:
        match = this.tail;
        this.tail = '';
        break;
      case 0:
        match = '';
        break;
      default:
        match = this.tail.substring(0, index);
        this.tail = this.tail.substring(index);
    }

    this.pos += match.length;

    return match;
  };

  /**
   * Represents a rendering context by wrapping a view object and
   * maintaining a reference to the parent context.
   */
  function Context (view, parentContext) {
    this.view = view;
    this.cache = { '.': this.view };
    this.parent = parentContext;
  }

  /**
   * Creates a new context using the given view with this context
   * as the parent.
   */
  Context.prototype.push = function push (view) {
    return new Context(view, this);
  };

  /**
   * Returns the value of the given name in this context, traversing
   * up the context hierarchy if the value is absent in this context's view.
   */
  Context.prototype.lookup = function lookup (name) {
    var cache = this.cache;

    var value;
    if (cache.hasOwnProperty(name)) {
      value = cache[name];
    } else {
      var context = this, names, index, lookupHit = false;

      while (context) {
        if (name.indexOf('.') > 0) {
          value = context.view;
          names = name.split('.');
          index = 0;

          /**
           * Using the dot notion path in `name`, we descend through the
           * nested objects.
           *
           * To be certain that the lookup has been successful, we have to
           * check if the last object in the path actually has the property
           * we are looking for. We store the result in `lookupHit`.
           *
           * This is specially necessary for when the value has been set to
           * `undefined` and we want to avoid looking up parent contexts.
           **/
          while (value != null && index < names.length) {
            if (index === names.length - 1)
              lookupHit = hasProperty(value, names[index]);

            value = value[names[index++]];
          }
        } else {
          value = context.view[name];
          lookupHit = hasProperty(context.view, name);
        }

        if (lookupHit)
          break;

        context = context.parent;
      }

      cache[name] = value;
    }

    if (isFunction(value))
      value = value.call(this.view);

    return value;
  };

  /**
   * A Writer knows how to take a stream of tokens and render them to a
   * string, given a context. It also maintains a cache of templates to
   * avoid the need to parse the same template twice.
   */
  function Writer () {
    this.cache = {};
  }

  /**
   * Clears all cached templates in this writer.
   */
  Writer.prototype.clearCache = function clearCache () {
    this.cache = {};
  };

  /**
   * Parses and caches the given `template` and returns the array of tokens
   * that is generated from the parse.
   */
  Writer.prototype.parse = function parse (template, tags) {
    var cache = this.cache;
    var tokens = cache[template];

    if (tokens == null)
      tokens = cache[template] = parseTemplate(template, tags);

    return tokens;
  };

  /**
   * High-level method that is used to render the given `template` with
   * the given `view`.
   *
   * The optional `partials` argument may be an object that contains the
   * names and templates of partials that are used in the template. It may
   * also be a function that is used to load partial templates on the fly
   * that takes a single argument: the name of the partial.
   */
  Writer.prototype.render = function render (template, view, partials) {
    var tokens = this.parse(template);
    var context = (view instanceof Context) ? view : new Context(view);
    return this.renderTokens(tokens, context, partials, template);
  };

  /**
   * Low-level method that renders the given array of `tokens` using
   * the given `context` and `partials`.
   *
   * Note: The `originalTemplate` is only ever used to extract the portion
   * of the original template that was contained in a higher-order section.
   * If the template doesn't use higher-order sections, this argument may
   * be omitted.
   */
  Writer.prototype.renderTokens = function renderTokens (tokens, context, partials, originalTemplate) {
    var buffer = '';

    var token, symbol, value;
    for (var i = 0, numTokens = tokens.length; i < numTokens; ++i) {
      value = undefined;
      token = tokens[i];
      symbol = token[0];

      if (symbol === '#') value = this.renderSection(token, context, partials, originalTemplate);
      else if (symbol === '^') value = this.renderInverted(token, context, partials, originalTemplate);
      else if (symbol === '>') value = this.renderPartial(token, context, partials, originalTemplate);
      else if (symbol === '&') value = this.unescapedValue(token, context);
      else if (symbol === 'name') value = this.escapedValue(token, context);
      else if (symbol === 'text') value = this.rawValue(token);

      if (value !== undefined)
        buffer += value;
    }

    return buffer;
  };

  Writer.prototype.renderSection = function renderSection (token, context, partials, originalTemplate) {
    var self = this;
    var buffer = '';
    var value = context.lookup(token[1]);

    // This function is used to render an arbitrary template
    // in the current context by higher-order sections.
    function subRender (template) {
      return self.render(template, context, partials);
    }

    if (!value) return;

    if (isArray(value)) {
      for (var j = 0, valueLength = value.length; j < valueLength; ++j) {
        buffer += this.renderTokens(token[4], context.push(value[j]), partials, originalTemplate);
      }
    } else if (typeof value === 'object' || typeof value === 'string' || typeof value === 'number') {
      buffer += this.renderTokens(token[4], context.push(value), partials, originalTemplate);
    } else if (isFunction(value)) {
      if (typeof originalTemplate !== 'string')
        throw new Error('Cannot use higher-order sections without the original template');

      // Extract the portion of the original template that the section contains.
      value = value.call(context.view, originalTemplate.slice(token[3], token[5]), subRender);

      if (value != null)
        buffer += value;
    } else {
      buffer += this.renderTokens(token[4], context, partials, originalTemplate);
    }
    return buffer;
  };

  Writer.prototype.renderInverted = function renderInverted (token, context, partials, originalTemplate) {
    var value = context.lookup(token[1]);

    // Use JavaScript's definition of falsy. Include empty arrays.
    // See https://github.com/janl/mustache.js/issues/186
    if (!value || (isArray(value) && value.length === 0))
      return this.renderTokens(token[4], context, partials, originalTemplate);
  };

  Writer.prototype.renderPartial = function renderPartial (token, context, partials) {
    if (!partials) return;

    var value = isFunction(partials) ? partials(token[1]) : partials[token[1]];
    if (value != null)
      return this.renderTokens(this.parse(value), context, partials, value);
  };

  Writer.prototype.unescapedValue = function unescapedValue (token, context) {
    var value = context.lookup(token[1]);
    if (value != null)
      return value;
  };

  Writer.prototype.escapedValue = function escapedValue (token, context) {
    var value = context.lookup(token[1]);
    if (value != null)
      return mustache.escape(value);
  };

  Writer.prototype.rawValue = function rawValue (token) {
    return token[1];
  };

  mustache.name = 'mustache.js';
  mustache.version = '2.3.0';
  mustache.tags = [ '{{', '}}' ];

  // All high-level mustache.* functions use this writer.
  var defaultWriter = new Writer();

  /**
   * Clears all cached templates in the default writer.
   */
  mustache.clearCache = function clearCache () {
    return defaultWriter.clearCache();
  };

  /**
   * Parses and caches the given template in the default writer and returns the
   * array of tokens it contains. Doing this ahead of time avoids the need to
   * parse templates on the fly as they are rendered.
   */
  mustache.parse = function parse (template, tags) {
    return defaultWriter.parse(template, tags);
  };

  /**
   * Renders the `template` with the given `view` and `partials` using the
   * default writer.
   */
  mustache.render = function render (template, view, partials) {
    if (typeof template !== 'string') {
      throw new TypeError('Invalid template! Template should be a "string" ' +
                          'but "' + typeStr(template) + '" was given as the first ' +
                          'argument for mustache#render(template, view, partials)');
    }

    return defaultWriter.render(template, view, partials);
  };

  // This is here for backwards compatibility with 0.4.x.,
  /*eslint-disable */ // eslint wants camel cased function name
  mustache.to_html = function to_html (template, view, partials, send) {
    /*eslint-enable*/

    var result = mustache.render(template, view, partials);

    if (isFunction(send)) {
      send(result);
    } else {
      return result;
    }
  };

  // Export the escaping function so that the user may override it.
  // See https://github.com/janl/mustache.js/issues/244
  mustache.escape = escapeHtml;

  // Export these mainly for testing, but also for advanced usage.
  mustache.Scanner = Scanner;
  mustache.Context = Context;
  mustache.Writer = Writer;

  return mustache;
}));

},{}],19:[function(require,module,exports){
/* object-iterators.js - Mini Underscore library
 * by Jonathan Eiten
 *
 * The methods below operate on objects (but not arrays) similarly
 * to Underscore (http://underscorejs.org/#collections).
 *
 * For more information:
 * https://github.com/joneit/object-iterators
 */

'use strict';

/**
 * @constructor
 * @summary Wrap an object for one method call.
 * @Desc Note that the `new` keyword is not necessary.
 * @param {object|null|undefined} object - `null` or `undefined` is treated as an empty plain object.
 * @return {Wrapper} The wrapped object.
 */
function Wrapper(object) {
    if (object instanceof Wrapper) {
        return object;
    }
    if (!(this instanceof Wrapper)) {
        return new Wrapper(object);
    }
    this.originalValue = object;
    this.o = object || {};
}

/**
 * @name Wrapper.chain
 * @summary Wrap an object for a chain of method calls.
 * @Desc Calls the constructor `Wrapper()` and modifies the wrapper for chaining.
 * @param {object} object
 * @return {Wrapper} The wrapped object.
 */
Wrapper.chain = function (object) {
    var wrapped = Wrapper(object); // eslint-disable-line new-cap
    wrapped.chaining = true;
    return wrapped;
};

Wrapper.prototype = {
    /**
     * Unwrap an object wrapped with {@link Wrapper.chain|Wrapper.chain()}.
     * @return {object|null|undefined} The value originally wrapped by the constructor.
     * @memberOf Wrapper.prototype
     */
    value: function () {
        return this.originalValue;
    },

    /**
     * @desc Mimics Underscore's [each](http://underscorejs.org/#each) method: Iterate over the members of the wrapped object, calling `iteratee()` with each.
     * @param {function} iteratee - For each member of the wrapped object, this function is called with three arguments: `(value, key, object)`. The return value of this function is undefined; an `.each` loop cannot be broken out of (use {@link Wrapper#find|.find} instead).
     * @param {object} [context] - If given, `iteratee` is bound to this object. In other words, this object becomes the `this` value in the calls to `iteratee`. (Otherwise, the `this` value will be the unwrapped object.)
     * @return {Wrapper} The wrapped object for chaining.
     * @memberOf Wrapper.prototype
     */
    each: function (iteratee, context) {
        var o = this.o;
        Object.keys(o).forEach(function (key) {
            iteratee.call(this, o[key], key, o);
        }, context || o);
        return this;
    },

    /**
     * @desc Mimics Underscore's [find](http://underscorejs.org/#find) method: Look through each member of the wrapped object, returning the first one that passes a truth test (`predicate`), or `undefined` if no value passes the test. The function returns the value of the first acceptable member, and doesn't necessarily traverse the entire object.
     * @param {function} predicate - For each member of the wrapped object, this function is called with three arguments: `(value, key, object)`. The return value of this function should be truthy if the member passes the test and falsy otherwise.
     * @param {object} [context] - If given, `predicate` is bound to this object. In other words, this object becomes the `this` value in the calls to `predicate`. (Otherwise, the `this` value will be the unwrapped object.)
     * @return {*} The found property's value, or undefined if not found.
     * @memberOf Wrapper.prototype
     */
    find: function (predicate, context) {
        var o = this.o;
        var result;
        if (o) {
            result = Object.keys(o).find(function (key) {
                return predicate.call(this, o[key], key, o);
            }, context || o);
            if (result !== undefined) {
                result = o[result];
            }
        }
        return result;
    },

    /**
     * @desc Mimics Underscore's [filter](http://underscorejs.org/#filter) method: Look through each member of the wrapped object, returning the values of all members that pass a truth test (`predicate`), or empty array if no value passes the test. The function always traverses the entire object.
     * @param {function} predicate - For each member of the wrapped object, this function is called with three arguments: `(value, key, object)`. The return value of this function should be truthy if the member passes the test and falsy otherwise.
     * @param {object} [context] - If given, `predicate` is bound to this object. In other words, this object becomes the `this` value in the calls to `predicate`. (Otherwise, the `this` value will be the unwrapped object.)
     * @return {*} An array containing the filtered values.
     * @memberOf Wrapper.prototype
     */
    filter: function (predicate, context) {
        var o = this.o;
        var result = [];
        if (o) {
            Object.keys(o).forEach(function (key) {
                if (predicate.call(this, o[key], key, o)) {
                    result.push(o[key]);
                }
            }, context || o);
        }
        return result;
    },

    /**
     * @desc Mimics Underscore's [map](http://underscorejs.org/#map) method: Produces a new array of values by mapping each value in list through a transformation function (`iteratee`). The function always traverses the entire object.
     * @param {function} iteratee - For each member of the wrapped object, this function is called with three arguments: `(value, key, object)`. The return value of this function is concatenated to the end of the new array.
     * @param {object} [context] - If given, `iteratee` is bound to this object. In other words, this object becomes the `this` value in the calls to `predicate`. (Otherwise, the `this` value will be the unwrapped object.)
     * @return {*} An array containing the filtered values.
     * @memberOf Wrapper.prototype
     */
    map: function (iteratee, context) {
        var o = this.o;
        var result = [];
        if (o) {
            Object.keys(o).forEach(function (key) {
                result.push(iteratee.call(this, o[key], key, o));
            }, context || o);
        }
        return result;
    },

    /**
     * @desc Mimics Underscore's [reduce](http://underscorejs.org/#reduce) method: Boil down the values of all the members of the wrapped object into a single value. `memo` is the initial state of the reduction, and each successive step of it should be returned by `iteratee()`.
     * @param {function} iteratee - For each member of the wrapped object, this function is called with four arguments: `(memo, value, key, object)`. The return value of this function becomes the new value of `memo` for the next iteration.
     * @param {*} [memo] - If no memo is passed to the initial invocation of reduce, the iteratee is not invoked on the first element of the list. The first element is instead passed as the memo in the invocation of the iteratee on the next element in the list.
     * @param {object} [context] - If given, `iteratee` is bound to this object. In other words, this object becomes the `this` value in the calls to `iteratee`. (Otherwise, the `this` value will be the unwrapped object.)
     * @return {*} The value of `memo` "reduced" as per `iteratee`.
     * @memberOf Wrapper.prototype
     */
    reduce: function (iteratee, memo, context) {
        var o = this.o;
        if (o) {
            Object.keys(o).forEach(function (key, idx) {
                memo = (!idx && memo === undefined) ? o[key] : iteratee(memo, o[key], key, o);
            }, context || o);
        }
        return memo;
    },

    /**
     * @desc Mimics Underscore's [extend](http://underscorejs.org/#extend) method: Copy all of the properties in each of the `source` object parameter(s) over to the (wrapped) destination object (thus mutating it). It's in-order, so the properties of the last `source` object will override properties with the same name in previous arguments or in the destination object.
     * > This method copies own members as well as members inherited from prototype chain.
     * @param {...object|null|undefined} source - Values of `null` or `undefined` are treated as empty plain objects.
     * @return {Wrapper|object} The wrapped destination object if chaining is in effect; otherwise the unwrapped destination object.
     * @memberOf Wrapper.prototype
     */
    extend: function (source) {
        var o = this.o;
        Array.prototype.slice.call(arguments).forEach(function (object) {
            if (object) {
                for (var key in object) {
                    o[key] = object[key];
                }
            }
        });
        return this.chaining ? this : o;
    },

    /**
     * @desc Mimics Underscore's [extendOwn](http://underscorejs.org/#extendOwn) method: Like {@link Wrapper#extend|extend}, but only copies its "own" properties over to the destination object.
     * @param {...object|null|undefined} source - Values of `null` or `undefined` are treated as empty plain objects.
     * @return {Wrapper|object} The wrapped destination object if chaining is in effect; otherwise the unwrapped destination object.
     * @memberOf Wrapper.prototype
     */
    extendOwn: function (source) {
        var o = this.o;
        Array.prototype.slice.call(arguments).forEach(function (object) {
            Wrapper(object).each(function (val, key) { // eslint-disable-line new-cap
                o[key] = val;
            });
        });
        return this.chaining ? this : o;
    }
};

// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/find
if (!Array.prototype.find) {
    Array.prototype.find = function (predicate) { // eslint-disable-line no-extend-native
        if (this === null) {
            throw new TypeError('Array.prototype.find called on null or undefined');
        }
        if (typeof predicate !== 'function') {
            throw new TypeError('predicate must be a function');
        }
        var list = Object(this);
        var length = list.length >>> 0;
        var thisArg = arguments[1];
        var value;

        for (var i = 0; i < length; i++) {
            value = list[i];
            if (predicate.call(thisArg, value, i, list)) {
                return value;
            }
        }
        return undefined;
    };
}

module.exports = Wrapper;

},{}],20:[function(require,module,exports){
arguments[4][3][0].apply(exports,arguments)
},{"dup":3}],21:[function(require,module,exports){
/**
 * pubsubstar v1.0.2
 * https://github.com/joneit/pubsubstar.git
 * Created by joneit on 8/13/17.
 */

/**
 * @module
 * @name pubsubstar
 * @desc Each calling context has its own distinct subscription namespace.
 *
 * 1. This object can serve as a global subscription context:
 * ```js
 * pubsubstar.subscribe(...);
 * ```
 * 2. Mix this object into your own object for a local subscription context:
 * ```js
 * Object.assign(myObj, pubsubstar);
 * myObj.subscribe(...);
 * ```
 * 3. Call each method with `.call` to specify a precise subscription context:
 * ```js
 * pubsubstar.subscribe.call(myObj, ...);
 * ```
 */


'use strict';


module.exports = {

    /**
     * @name subscribe
     * @memberOf module:pubsubstar
     * @summary Binds `subscriber` to `topic`.
     * @desc Multiple subscribers may be bound in consecutive calls.
     * All bound subscribers will be called when {@link module:pubsubstar#publish} is called with the same topic string.
     * @param {string} topic - Topic to subscribe `subscriber` to.
     * @param {function} subscriber
     */
    subscribe: function (topic, subscriber) {
        if (typeof topic !== 'string') {
            throw new TypeError('Expected topic to be a string.');
        }

        if (typeof subscriber !== 'function') {
            throw new TypeError('Expected subscriber to be a function.');
        }

        /**
         * @name subscriptions
         * @memberOf module:pubsubstar
         * @private
         * @type {Object}
         * @summary Subscriptions namespace
         * @desc Hash of subscribers by topic.
         * There are distinct "namespaces" for each context.
         * Created on the context when needed.
         */
        if (!this._pubsub) {
            Object.defineProperty(this, '_pubsub', {
                enumerable: false, // so Object.assign won't mix it into a local context
                value: Object.create(null)
            });
        }

        var namespace = this._pubsub,
            subscribers = namespace[topic] || (namespace[topic] = []),
            subscriberNotFound = subscribers.indexOf(subscriber) < 0;

        if (subscriberNotFound) {
            subscribers.push(subscriber);
        }
    },

    /**
     * Unsubscribe `subscriber` (or all subscribers) from `topic` (or from all topics).
     * @param {string|RegExp} topic - Topic to unsubscribe `subscriber` from.
     * To match multiple topics, include `*` wildcard(s) or specify a `RegExp`.
     * It is recommended that your regex patterns begin with `^` and end with `$` to match whole topic strings.
     * @param {function} [subscriber] - If not given, unsubscribes all subscribers from all specified `topics`.
     */
    unsubscribe: function (topics, subscriber) {
        forEachTopic.call(this, topics, function (subscribers, topic, subscriptions) {
            if (subscriber) {
                var subscriberIndex = subscribers.indexOf(subscriber),
                    subscriberFound = subscriberIndex >= 0;

                if (subscriberFound) {
                    subscribers.splice(subscriberIndex, 1); // remove subscriber from each topic wherein found
                }
            } else {
                delete subscriptions[topic]; // unsubscribe all subscribers from each topic
            }
        });
    },

    /**
     * Publishes `message` to the given `topic`, invoking any subscribers bound to `topic` by {@link DataSourceBase#subscribe}.
     *
     * ### Results
     * @example
     * dataModel.publish('set-sorts', sorts); // results discarded
     * @example <caption>Synchronous subscribers returning values</caption>
     * var results = dataModel.publish('get-sorts'); // array of results from all subscribers
     * @example <caption>Asynchronous subscribers (return promises)</caption>
     * Promise.all(publish('get-sorts')).then(function(resultsArray) { ... });
     * @param {string|RegExp} topic - Topic to publish to.
     * To match multiple topics, include `*` wildcard(s) or specify a `RegExp`.
     * @param {*} [message]
     * @returns {Array} Results of calls to all bound subscribers.
     *
     * ### About returned results
     *
     * Any topic can return useful information but in practice only certain topics do so.
     * These are typically named starting with `get-`.
     *
     * Results are always returned in an array, one result from each subscriber.
     * The length of the returned array represents the number of subscribers called.
     * Typically there will be a single subscriber, in which case `publish` will return a single-element array.
     * When there are multiple subscribers, the array will hold multiple results.
     * Although an array, the order of the results should be considered undefined;
     * if you need to know which of several subscribers generated a particular
     * result, the subscriber should put identifying information in the result.
     *
     * ### Asynchronous subscribers
     * If your subscribers are asynch, a very useful pattern is to have them return promises. `publish` will then return
     * an array of promises, which in turn can be used to determine when all the subscribers have responded by calling
     * {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/all Promise.all}.
     * For example, to wait for all the subscribers to complete and obtain the final results array:
     * ```js
     * Promise.all(publish(topic, data))
     *     .catch(function(reason) {
     *         // If you get here it means at least one of the subscribers failed,
     *         // having called `reject` or having thrown an error.
     *     })
     *     .then(function(resultsArray) {
     *         // If you get here it means all the promises succeeded, all having called `resolve` with some value.
     *         // The results (i.e., all the resolve values) are in the parameter which is an array.
     *     });
     * ```
     * Caveat: Only call Promise.all on the results when the subscribers return promises.
     * Although these would typically be async subscribers, they can include synchronous subscribers as well so long as
     * they too return promises, although in those cases they would be pre-resolved promises (see
     * {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/resolve Promise.resolve()}).
     * This pattern accommodates a mixture of sync and async subscribers all subscribed to the same topic.
     */
    publish: function(topics, message) {
        var results = [];

        forEachTopic.call(this, topics, function(subscribers, topic, subscriptions) {
            for (var i = 0; i < subscribers.length; ++i) {
                results.push(subscribers[i].call(this, message));
            }
        });

        return results;
    }

};


// `mixin` offers alternative method names
Object.defineProperty(module.exports, 'mixin', {
    enumerable: false, // so not itself mixed in
    value: {
        on: module.exports.subscribe,
        off: module.exports.unsubscribe,
        trigger: module.exports.publish
    }
});


function forEachTopic(topics, fn) {
    var namespace = this._pubsub;

    if (!namespace) {
        return;
    }

    // make sure `topics` is a regex
    if (!(topics instanceof RegExp)) {
        if (typeof topics !== 'string') {
            throw new TypeError('Expected topic to be a string (with optional "*" wildcards) or a regex.');
        }
        topics = new RegExp('^' + topics.replace(/([^\\])\*+/g, '$1.*').replace(/^\*/, '.*') + '$');
    }

    for (var topic in namespace) {
        if (topics.test(topic) && namespace[topic]) {
            fn.call(this, namespace[topic], topic, namespace);
        }
    }
}

},{}],22:[function(require,module,exports){
'use strict';

/* eslint-env node, browser */

/**
 * Creates a new read-only property and attaches it to the provided context.
 * @private
 * @param {string} name - Name for new property.
 * @param {*} [value] - Value of new property.
 */
function addReadOnlyProperty(name, value) {
    Object.defineProperty(this, name, {
        value: value,
        writable: false,
        enumerable: true,
        configurable: false
    });
}

/**
 * @constructor Point
 *
 * @desc This object represents a single point in an abstract 2-dimensional matrix.
 *
 * The unit of measure is typically pixels.
 * (If used to model computer graphics, vertical coordinates are typically measured downwards
 * from the top of the window. This convention however is not inherent in this object.)
 *
 * Note: This object should be instantiated with the `new` keyword.
 *
 * @param {number} x - the new point's `x` property
 * @param {number} y - the new point's `y` property
 */
function Point(x, y) {

    /**
     * @name x
     * @type {number}
     * @summary This point's horizontal coordinate.
     * @desc Created upon instantiation by the {@link Point|constructor}.
     * @memberOf Point.prototype
     * @abstract
     */
    addReadOnlyProperty.call(this, 'x', Number(x) || 0);

    /**
     * @name y
     * @type {number}
     * @summary This point's vertical coordinate.
     * @desc Created upon instantiation by the {@link Point|constructor}.
     * @memberOf Point.prototype
     * @abstract
     */
    addReadOnlyProperty.call(this, 'y', Number(y) || 0);

}

Point.prototype = {

    /**
     * @returns {Point} A new point which is this point's position increased by coordinates of given `offset`.
     * @param {Point} offset - Horizontal and vertical values to add to this point's coordinates.
     * @memberOf Point.prototype
     */
    plus: function(offset) {
        return new Point(
            this.x + offset.x,
            this.y + offset.y
        );
    },

    /**
     * @returns {Point} A new point which is this point's position increased by given offsets.
     * @param {number} [offsetX=0] - Value to add to this point's horizontal coordinate.
     * @param {number} [offsetY=0] - Value to add to this point's horizontal coordinate.
     * @memberOf Point.prototype
     */
    plusXY: function(offsetX, offsetY) {
        return new Point(
            this.x + (offsetX || 0),
            this.y + (offsetY || 0)
        );
    },

    /**
     * @returns {Point} A new point which is this point's position decreased by coordinates of given `offset`.
     * @param {Point} offset - Horizontal and vertical values to subtract from this point's coordinates.
     * @memberOf Point.prototype
     */
    minus: function(offset) {
        return new Point(
            this.x - offset.x,
            this.y - offset.y
        );
    },

    /**
     * @returns {Point} A new `Point` positioned to least x and least y of this point and given `offset`.
     * @param {Point} point - A point to compare to this point.
     * @memberOf Point.prototype
     */
    min: function(point) {
        return new Point(
            Math.min(this.x, point.x),
            Math.min(this.y, point.y)
        );
    },

    /**
     * @returns {Point} A new `Point` positioned to greatest x and greatest y of this point and given `point`.
     * @param {Point} point - A point to compare to this point.
     * @memberOf Point.prototype
     */
    max: function(point) {
        return new Point(
            Math.max(this.x, point.x),
            Math.max(this.y, point.y)
        );
    },

    /**
     * @returns {number} Distance between given `point` and this point using Pythagorean Theorem formula.
     * @param {Point} point - A point from which to compute the distance to this point.
     * @memberOf Point.prototype
     */
    distance: function(point) {
        var deltaX = point.x - this.x,
            deltaY = point.y - this.y;

        return Math.sqrt(
            deltaX * deltaX +
            deltaY * deltaY
        );
    },

    /**
     * _(Formerly: `equal`.)_
     * @returns {boolean} `true` iff _both_ coordinates of this point are exactly equal to those of given `point`.
     * @param {Point} point - A point to compare to this point.
     * @memberOf Point.prototype
     */
    equals: function(point) {
        var result = false;

        if (point) {
            result =
                this.x === point.x &&
                this.y === point.y;
        }

        return result;
    },

    /**
     * @returns {boolean} `true` iff _both_ coordinates of this point are greater than those of given `point`.
     * @param {Point} point - A point to compare to this point
     * @memberOf Point.prototype
     */
    greaterThan: function(point) {
        return (
            this.x > point.x &&
            this.y > point.y
        );
    },

    /**
     * @returns {boolean} `true` iff _both_ coordinates of this point are less than those of given `point`.
     * @param {Point} point - A point to compare to this point
     * @memberOf Point.prototype
     */
    lessThan: function(point) {
        return (
            this.x < point.x &&
            this.y < point.y
        );
    },

    /**
     * _(Formerly `greaterThanEqualTo`.)_
     * @returns {boolean} `true` iff _both_ coordinates of this point are greater than or equal to those of given `point`.
     * @param {Point} point - A point to compare to this point
     * @memberOf Point.prototype
     */
    greaterThanOrEqualTo: function(point) {
        return (
            this.x >= point.x &&
            this.y >= point.y
        );
    },

    /**
     * _(Formerly `lessThanEqualTo`.)_
     * @returns {boolean} `true` iff _both_ coordinates of this point are less than or equal to those of given `point`.
     * @param {Point} point - A point to compare to this point.
     * @memberOf Point.prototype
     */
    lessThanOrEqualTo: function(point) {
        return (
            this.x <= point.x &&
            this.y <= point.y
        );
    },

    /**
     * _(Formerly `isContainedWithinRectangle`.)_
     * @param rect {Rectangle} - Rectangle to test this point against.
     * @returns {boolean} `true` iff this point is within given `rect`.
     * @memberOf Point.prototype
     */
    within: function(rect) {
        var minX = rect.origin.x,
            maxX = minX + rect.extent.x;
        var minY = rect.origin.y,
            maxY = minY + rect.extent.y;

        if (rect.extent.x < 0) {
            minX = maxX;
            maxX = rect.origin.x;
        }

        if (rect.extent.y < 0) {
            minY = maxY;
            maxY = rect.origin.y;
        }

        return (
            minX <= this.x && this.x < maxX &&
            minY <= this.y && this.y < maxY
        );
    }
};

Point.prototype.EQ = Point.prototype.equals;
Point.prototype.GT = Point.prototype.greaterThan;
Point.prototype.LT = Point.prototype.lessThan;
Point.prototype.GE = Point.prototype.greaterThanOrEqualTo;
Point.prototype.LE = Point.prototype.lessThanOrEqualTo;


/**
 * @constructor Rectangle
 *
 * @desc This object represents a rectangular area within an abstract 2-dimensional matrix.
 *
 * The unit of measure is typically pixels.
 * (If used to model computer graphics, vertical coordinates are typically measured downwards
 * from the top of the window. This convention however is not inherent in this object.)
 *
 * Normally, the `x` and `y` parameters to the constructor describe the upper left corner of the rect.
 * However, negative values of `width` and `height` will be added to the given `x` and `y`. That is,
 * a negative value of the `width` parameter will extend the rect to the left of the given `x` and
 * a negative value of the `height` parameter will extend the rect above the given `y`.
 * In any case, after instantiation the following are guaranteed to always be true:
 * * The `extent`, `width`, and `height` properties _always_ give positive values.
 * * The `origin`, `top`, and `left` properties _always_ reflect the upper left corner.
 * * The `corner`, `bottom`, and `right` properties _always_ reflect the lower right corner.
 *
 * Note: This object should be instantiated with the `new` keyword.
 *
 * @param {number} [x=0] - Horizontal coordinate of some corner of the rect.
 * @param {number} [y=0] - Vertical coordinate of some corner of the rect.
 * @param {number} [width=0] - Width of the new rect. May be negative (see above).
 * @param {number} [height=0] - Height of the new rect. May be negative (see above).
 */
function Rectangle(x, y, width, height) {

    x = Number(x) || 0;
    y = Number(y) || 0;
    width = Number(width) || 0;
    height = Number(height) || 0;

    if (width < 0) {
        x += width;
        width = -width;
    }

    if (height < 0) {
        y += height;
        height = -height;
    }

    /**
     * @name origin
     * @type {Point}
     * @summary Upper left corner of this rect.
     * @desc Created upon instantiation by the {@linkplain Rectangle|constructor}.
     * @memberOf Rectangle.prototype
     * @abstract
     */
    addReadOnlyProperty.call(this, 'origin', new Point(x, y));

    /**
     * @name extent
     * @type {Point}
     * @summary this rect's width and height.
     * @desc Unlike the other `Point` properties, `extent` is not a global coordinate pair; rather it consists of a _width_ (`x`, always positive) and a _height_ (`y`, always positive).
     *
     * This object might be more legitimately typed as something like `Area` with properties `width` and `height`; however we wanted it to be able to use it efficiently with a point's `plus` and `minus` methods (that is, without those methods having to check and branch on the type of its parameter).
     *
     * Created upon instantiation by the {@linkplain Rectangle|constructor}.
     * @see The {@link Rectangle#corner|corner} method.
     * @memberOf Rectangle.prototype
     * @abstract
     */
    addReadOnlyProperty.call(this, 'extent', new Point(width, height));

    /**
     * @name corner
     * @type {Point}
     * @summary Lower right corner of this rect.
     * @desc This is a calculated value created upon instantiation by the {@linkplain Rectangle|constructor}. It is `origin` offset by `extent`.
     *
     * **Note:** These coordinates actually point to the pixel one below and one to the right of the rect's actual lower right pixel.
     * @memberOf Rectangle.prototype
     * @abstract
     */
    addReadOnlyProperty.call(this, 'corner', new Point(x + width, y + height));

    /**
     * @name center
     * @type {Point}
     * @summary Center of this rect.
     * @desc Created upon instantiation by the {@linkplain Rectangle|constructor}.
     * @memberOf Rectangle.prototype
     * @abstract
     */
    addReadOnlyProperty.call(this, 'center', new Point(x + (width / 2), y + (height / 2)));

}

Rectangle.prototype = {

    /**
     * @type {number}
     * @desc _(Formerly a function; now a getter.)_
     * @summary Minimum vertical coordinate of this rect.
     * @memberOf Rectangle.prototype
     */
    get top() {
        return this.origin.y;
    },

    /**
     * @type {number}
     * @desc _(Formerly a function; now a getter.)_
     * @summary Minimum horizontal coordinate of this rect.
     * @memberOf Rectangle.prototype
     */
    get left() {
        return this.origin.x;
    },

    /**
     * @type {number}
     * @desc _(Formerly a function; now a getter.)_
     * @summary Maximum vertical coordinate of this rect + 1.
     * @memberOf Rectangle.prototype
     */
    get bottom() {
        return this.corner.y;
    },

    /**
     * @type {number}
     * @desc _(Formerly a function; now a getter.)_
     * @summary Maximum horizontal coordinate of this rect + 1.
     * @memberOf Rectangle.prototype
     */
    get right() {
        return this.corner.x;
    },

    /**
     * @type {number}
     * @desc _(Formerly a function; now a getter.)_
     * @summary Width of this rect (always positive).
     * @memberOf Rectangle.prototype
     */
    get width() {
        return this.extent.x;
    },

    /**
     * @type {number}
     * @desc _(Formerly a function; now a getter.)_
     * @summary Height of this rect (always positive).
     * @memberOf Rectangle.prototype
     */
    get height() {
        return this.extent.y;
    },

    /**
     * @type {number}
     * @desc _(Formerly a function; now a getter.)_
     * @summary Area of this rect.
     * @memberOf Rectangle.prototype
     */
    get area() {
        return this.width * this.height;
    },

    /**
     * @returns {Rectangle} A copy of this rect but with horizontal position reset to given `x` and no width.
     * @param {number} x - Horizontal coordinate of the new rect.
     * @memberOf Rectangle.prototype
     */
    flattenXAt: function(x) {
        return new Rectangle(x, this.origin.y, 0, this.extent.y);
    },

    /**
     * @returns {Rectangle} A copy of this rect but with vertical position reset to given `y` and no height.
     * @param {number} y - Vertical coordinate of the new rect.
     * @memberOf Rectangle.prototype
     */
    flattenYAt: function(y) {
        return new Rectangle(this.origin.x, y, this.extent.x, 0);
    },

    /**
     * @returns {boolean} `true` iff given `point` entirely contained within this rect.
     * @param {Point} pointOrRect - The point or rect to test for containment.
     * @memberOf Rectangle.prototype
     */
    contains: function(pointOrRect) {
        return pointOrRect.within(this);
    },

    /**
     * _(Formerly `isContainedWithinRectangle`.)_
     * @returns {boolean} `true` iff `this` rect is entirely contained within given `rect`.
     * @param {Rectangle} rect - Rectangle to test against this rect.
     * @memberOf Rectangle.prototype
     */
    within: function(rect) {
        return (
            rect.origin.lessThanOrEqualTo(this.origin) &&
            rect.corner.greaterThanOrEqualTo(this.corner)
        );
    },

    /**
     * _(Formerly: `insetBy`.)_
     * @returns {Rectangle} That is enlarged/shrunk by given `padding`.
     * @param {number} padding - Amount by which to increase (+) or decrease (-) this rect
     * @see The {@link Rectangle#shrinkBy|shrinkBy} method.
     * @memberOf Rectangle.prototype
     */
    growBy: function(padding) {
        return new Rectangle(
            this.origin.x + padding,
            this.origin.y + padding,
            this.extent.x - padding - padding,
            this.extent.y - padding - padding);
    },

    /**
     * @returns {Rectangle} That is enlarged/shrunk by given `padding`.
     * @param {number} padding - Amount by which to decrease (+) or increase (-) this rect.
     * @see The {@link Rectangle#growBy|growBy} method.
     * @memberOf Rectangle.prototype
     */
    shrinkBy: function(padding) {
        return this.growBy(-padding);
    },

    /**
     * @returns {Rectangle} Bounding rect that contains both this rect and the given `rect`.
     * @param {Rectangle} rect - The rectangle to union with this rect.
     * @memberOf Rectangle.prototype
     */
    union: function(rect) {
        var origin = this.origin.min(rect.origin),
            corner = this.corner.max(rect.corner),
            extent = corner.minus(origin);

        return new Rectangle(
            origin.x, origin.y,
            extent.x, extent.y
        );
    },

    /**
     * iterate over all points within this rect, invoking `iteratee` for each.
     * @param {function(number,number)} iteratee - Function to call for each point.
     * Bound to `context` when given; otherwise it is bound to this rect.
     * Each invocation of `iteratee` is called with two arguments:
     * the horizontal and vertical coordinates of the point.
     * @param {object} [context=this] - Context to bind to `iteratee` (when not `this`).
     * @memberOf Rectangle.prototype
     */
    forEach: function(iteratee, context) {
        context = context || this;
        for (var x = this.origin.x, x2 = this.corner.x; x < x2; x++) {
            for (var y = this.origin.y, y2 = this.corner.y; y < y2; y++) {
                iteratee.call(context, x, y);
            }
        }
    },

    /**
     * @returns {Rectangle} One of:
     * * _If this rect intersects with the given `rect`:_
     *      a new rect representing that intersection.
     * * _If it doesn't intersect and `ifNoneAction` defined:_
     *      result of calling `ifNoneAction`.
     * * _If it doesn't intersect and `ifNoneAction` undefined:_
     *      `null`.
     * @param {Rectangle} rect - The rectangle to intersect with this rect.
     * @param {function(Rectangle)} [ifNoneAction] - When no intersection, invoke and return result.
     * Bound to `context` when given; otherwise bound to this rect.
     * Invoked with `rect` as sole parameter.
     * @param {object} [context=this] - Context to bind to `ifNoneAction` (when not `this`).
     * @memberOf Rectangle.prototype
     */
    intersect: function(rect, ifNoneAction, context) {
        var result = null,
            origin = this.origin.max(rect.origin),
            corner = this.corner.min(rect.corner),
            extent = corner.minus(origin);

        if (extent.x > 0 && extent.y > 0) {
            result = new Rectangle(
                origin.x, origin.y,
                extent.x, extent.y
            );
        } else if (typeof ifNoneAction === 'function') {
            result = ifNoneAction.call(context || this, rect);
        }

        return result;
    },

    /**
     * @returns {boolean} `true` iff this rect overlaps with given `rect`.
     * @param {Rectangle} rect - The rectangle to intersect with this rect.
     * @memberOf Rectangle.prototype
     */
    intersects: function(rect) {
        return (
            rect.corner.x > this.origin.x &&
            rect.corner.y > this.origin.y &&
            rect.origin.x < this.corner.x &&
            rect.origin.y < this.corner.y
        );
    }
};

// Interface
exports.Point = Point;
exports.Rectangle = Rectangle;

},{}],23:[function(require,module,exports){
'use strict';

/* eslint-env node, browser */

(function (module) {  // eslint-disable-line no-unused-expressions

    // This closure supports NodeJS-less client side includes with <script> tags. See https://github.com/joneit/mnm.

    /**
     * @constructor RangeSelectionModel
     *
     * @desc This object models selection of "cells" within an abstract single-dimensional matrix.
     *
     * Disjoint selections can be built with calls to the following methods:
     * * {@link RangeSelectionModel#select|select(start, stop)} - Add a range to the matrix.
     * * {@link RangeSelectionModel#deselect|deselect(start, stop)} - Remove a range from the matrix.
     *
     * Two more methods are available:
     * * Test a cell to see if it {@link RangeSelectionModel#isSelected|isSelected(cell)}
     * * {@link RangeSelectionModel#clear|clear()} the matrix
     *
     * Internally, the selection is run-length-encoded. It is therefore a "sparse" matrix
     * with undefined bounds. A single data property called `selection` is an array that
     * contains all the "runs" (ranges) of selected cells albeit in no particular order.
     * This property should not normally need to be accessed directly.
     *
     * Note: This object should be instantiated with the `new` keyword.
     *
     * @returns {RangeSelectionModel} Self (i.e., `this` object).
     */
    function RangeSelectionModel() {
        /**
         * @name selection
         * @type {Array.Array.number}
         * @summary Unordered list of runs.
         * @desc A "run" is defined as an Array(2) where:
         * * element [0] is the beginning of the run
         * * element [1] is the end of the run (inclusive) and is always >= element [0]
         * The order of the runs within is undefined.
         * @memberOf RangeSelectionModel.prototype
         * @abstract
         */
        this.selection = [];

        //we need to be able to go back in time
        //the states field
        this.states = [];

        //clone and store my current state
        //so we can unwind changes if need be
        this.storeState = function () {
            var sels = this.selection;
            var state = [];
            var copy;
            for (var i = 0; i < sels.length; i++) {
                copy = [].concat(sels[i]);
                state.push(copy);
            }
            this.states.push(state);
        };
    }

    RangeSelectionModel.prototype = {

        /**
         * @summary Add a contiguous run of points to the selection.
         * @desc Insert a new run into `this.selection`.
         * The new run will be merged with overlapping and adjacent runs.
         *
         * The two parameters may be given in either order.
         * The start and stop elements in the resulting run will however always be ordered.
         * (However, note that the order of the runs within `this.selection` is itself always unordered.)
         *
         * Note that `this.selection` is updated in place, preserving validity of any external references.
         * @param {number} start - Start of run. May be greater than `stop`.
         * @param {number} [stop=stop] - End of run (inclusive). May be less than `start`.
         * @returns {RangeSelectionModel} Self (i.e., `this`), for chaining.
         * @memberOf RangeSelectionModel.prototype
         */
        select: function (start, stop) {
            this.storeState();
            var run = makeRun(start, stop);
            var splicer = [0, 1];
            this.selection.forEach(function (each) {
                if (overlaps(each, run) || abuts(each, run)) {
                    run = merge(each, run);
                } else {
                    splicer.push(each);
                }
            });
            splicer.push(run);
            splicer[1] = this.selection.length;
            this.selection.splice.apply(this.selection, splicer); // update in place to preserve external references
            return this;
        },

        /**
         * @summary Remove a contiguous run of points from the selection.
         * @desc Truncate and/or remove run(s) from `this.selection`.
         * Removing part of existing runs will (correctly) shorten them or break them into two fragments.
         *
         * The two parameters may be given in either order.
         *
         * Note that `this.selection` is updated in place, preserving validity of any external references.
         * @param {number} start - Start of run. May be greater than `stop`.
         * @param {number} [stop=stop] - End of run (inclusive). May be less than `start`.
         * @returns {RangeSelectionModel} Self (i.e., `this`), for chaining.
         * @memberOf RangeSelectionModel.prototype
         */
        deselect: function (start, stop) {
            var run = makeRun(start, stop);
            var splicer = [0, 0];
            this.selection.forEach(function (each) {
                if (overlaps(each, run)) {
                    var pieces = subtract(each, run);
                    splicer = splicer.concat(pieces);
                } else {
                    splicer.push(each);
                }
            });
            splicer[1] = this.selection.length;
            this.selection.splice.apply(this.selection, splicer); // update in place to preserve external references
            return this;
        },

        /**
         * @summary Empties `this.selection`, effectively removing all runs.
         * @returns {RangeSelectionModel} Self (i.e., `this`), for chaining.
         * @memberOf RangeSelectionModel.prototype
         */
        clear: function () {
            this.states.length = 0;
            this.selection.length = 0;
            return this;
        },

        clearMostRecentSelection: function () {
            if (this.states.length === 0) {
                return;
            }
            this.selection = this.states.pop();
        },

        /**
         * @summary Determines if the given `cell` is selected.
         * @returns {boolean} `true` iff given `cell` is within any of the runs in `this.selection`.
         * @param {number} cell - The cell to test for inclusion in the selection.
         * @memberOf RangeSelectionModel.prototype
         */
        isSelected: function (cell) {
            return this.selection.some(function (each) {
                return each[0] <= cell && cell <= each[1];
            });
        },

        isEmpty: function (){
            return this.selection.length === 0;
        },

        /**
         * @summary Return the indexes that are selected.
         * @desc Return the indexes that are selected.
         * @returns {Array.Array.number}
         * @memberOf RangeSelectionModel.prototype
         */
        getSelections: function (){
            var result = [];
            this.selection.forEach(function (each) {
                for (var i = each[0]; i <= each[1]; i++) {
                    result.push(i);
                }
            });
            result.sort(function (a, b){
                return a - b;
            });
            return result;
        }

    };

    /**
     * @private
     * @summary Preps `start` and `stop` params into order array
     * @function makeRun
     * @desc Utility function called by both `select()` and `deselect()`.
     * @param {number|number[]} start - Start of run. if array, `start` and `stop` are taken from first two elements.
     * @param {number} [stop=start] - End of run (inclusive).
     */
    function makeRun(start, stop) {
        return (
            start instanceof Array
                ? makeRun.apply(this, start) // extract params from given array
                : stop === undefined
                ? [ start, start ] // single param is a run that stops where it starts
                : start <= stop
                ? [ start, stop ]
                : [ stop, start ] // reverse descending params into ascending order
        );
    }

    /**
     * @private
     * @function overlaps
     * @returns {boolean} `true` iff `run1` overlaps `run2`
     * @summary Comparison operator that determines if given runs overlap with one another.
     * @desc Both parameters are assumed to be _ordered_ arrays.
     *
     * Overlap is defined to include the case where one run completely contains the other.
     *
     * Note: This operator is commutative.
     * @param {number[]} run1 - first run
     * @param {number[]} run2 - second run
     */
    function overlaps(run1, run2) {
        return (
            run1[0] <= run2[0] && run2[0] <= run1[1] || // run2's start is within run1 OR...
            run1[0] <= run2[1] && run2[1] <= run1[1] || // run2's stop is within run1 OR...
            run2[0] <  run1[0] && run1[1] <  run2[1]    // run2 completely contains run1
        );
    }

    /**
     * @private
     * @function abuts
     * @summary Comparison operator that determines if given runs are consecutive with one another.
     * @returns {boolean} `true` iff `run1` is consecutive with `run2`
     * @desc Both parameters are assumed to be _ordered_ arrays.
     *
     * Note: This operator is commutative.
     * @param {number[]} run1 - first run
     * @param {number[]} run2 - second run
     */
    function abuts(run1, run2) {
        return (
            run1[1] === run2[0] - 1 || // run1's top immediately precedes run2's start OR...
            run2[1] === run1[0] - 1    // run2's top immediately precedes run1's start
        );
    }

    /**
     * @private
     * @function subtract
     * @summary Operator that subtracts one run from another.
     * @returns {Array.Array.number} The remaining pieces of `minuend` after removing `subtrahend`.
     * @desc Both parameters are assumed to be _ordered_ arrays.
     *
     * This function _does not assumes_ that `overlap()` has already been called with the same runs and has returned `true`.
     *
     * Returned array contains 0, 1, or 2 runs which are the portion(s) of `minuend` that do _not_ include `subtrahend`.
     *
     * Caveat: This operator is *not* commutative.
     * @param {number[]} minuend - a run from which to "subtract" `subtrahend`
     * @param {number[]} subtrahend - a run to "subtracted" from `minuend`
     */
    function subtract(minuend, subtrahend) {
        var m0 = minuend[0];
        var m1 = minuend[1];
        var s0 = subtrahend[0];
        var s1 = subtrahend[1];
        var result = [];

        if (s0 <= m0 && s1 < m1) {
            //subtrahend extends before minuend: return remaining piece of `minuend`
            result.push([s1 + 1, m1]);
        } else if (s0 > m0 && s1 >= m1) {
            //subtrahend extends after minuend: return remaining piece of `minuend`
            result.push([m0, s0 - 1]);
        } else if (m0 < s0 && s1 < m1) {
            //completely inside: return 2 smaller pieces resulting from the hole
            result.push([m0, s0 - 1]);
            result.push([s1 + 1, m1]);
        } else if (s1 < m0 || s0 > m1) {
            // completely outside: return `minuend` untouched
            result.push(minuend);
        }

        //else subtrahend must completely overlap minuend so return no pieces

        return result;
    }


    // Local utility functions

    /**
     * @private
     * @function merge
     * @summary Operator that merges given runs.
     * @returns {number[]} A single merged run.
     * @desc Both parameters are assumed to be _ordered_ arrays.
     *
     * The runs are assumed to be overlapping or adjacent to one another.
     *
     * Note: This operator is commutative.
     * @param {number[]} run1 - a run to merge with `run2`
     * @param {number[]} run2 - a run to merge with `run1`
     */
    function merge(run1, run2) {
        var min = Math.min(Math.min.apply(Math, run1), Math.min.apply(Math, run2));
        var max = Math.max(Math.max.apply(Math, run1), Math.max.apply(Math, run2));
        return [min, max];
    }

    // Interface
    module.exports = RangeSelectionModel;
})(
    typeof module === 'object' && module || (window.RangeSelectionModel = {}),
    typeof module === 'object' && module.exports || (window.RangeSelectionModel.exports = {})
) || (
    typeof module === 'object' || (window.RangeSelectionModel = window.RangeSelectionModel.exports)
);

/* About the above IIFE:
 * This file is a "modified node module." It functions as usual in Node.js *and* is also usable directly in the browser.
 * 1. Node.js: The IIFE is superfluous but innocuous.
 * 2. In the browser: The IIFE closure serves to keep internal declarations private.
 * 2.a. In the browser as a global: The logic in the actual parameter expressions + the post-invocation expression
 * will put your API in `window.RangeSelectionModel`.
 * 2.b. In the browser as a module: If you predefine a `window.module` object, the results will be in `module.exports`.
 * The bower component `mnm` makes this easy and also provides a global `require()` function for referencing your module
 * from other closures. In either case, this works with both NodeJs-style export mechanisms -- a single API assignment,
 * `module.exports = yourAPI` *or* a series of individual property assignments, `module.exports.property = property`.
 *
 * Before the IIFE runs, the actual parameter expressions are executed:
 * 1. If `window` object undefined, we're in NodeJs so assume there is a `module` object with an `exports` property
 * 2. If `window` object defined, we're in browser
 * 2.a. If `module` object predefined, use it
 * 2.b. If `module` object undefined, create a `RangeSelectionModel` object
 *
 * After the IIFE returns:
 * Because it always returns undefined, the expression after the || will execute:
 * 1. If `window` object undefined, then we're in NodeJs so we're done
 * 2. If `window` object defined, then we're in browser
 * 2.a. If `module` object predefined, we're done; results are in `moudule.exports`
 * 2.b. If `module` object undefined, redefine`RangeSelectionModel` to be the `RangeSelectionModel.exports` object
 */

},{}],24:[function(require,module,exports){
module.exports={
  "name": "fin-hypergrid",
  "version": "2.1.2",
  "description": "Canvas-based high-performance grid",
  "repository": {
    "type": "git",
    "url": "git://github.com/openfin/fin-hypergrid.git"
  },
  "author": "SWirts, JEiten, DJones, NMichaud",
  "license": "MIT",
  "readmeFilename": "README.md",
  "gitHead": "",
  "keywords": [
    "spreadsheet",
    "grid"
  ],
  "dependencies": {
    "datasaur-base": "../datasaur-base",
    "datasaur-local": "../datasaur-local",
    "extend-me": "^2.5.0",
    "fin-hypergrid-event-logger": "^1.0.4",
    "fin-hypergrid-field-tools": "^1.0.2",
    "finbars": "1.5.2",
    "inject-stylesheet-template": "^1.0.1",
    "mustache": "^2.3.0",
    "object-iterators": "1.3.0",
    "overrider": "^0",
    "pubsubstar": "^1.0.2",
    "rectangular": "1.0.1",
    "sparse-boolean-array": "1.0.1"
  },
  "devDependencies": {
    "browser-sync": "^2.23.6",
    "browserify": "^15.2.0",
    "css-injector": "^1.1.0",
    "gulp": "^3.9.0",
    "gulp-concat": "^2.6.0",
    "gulp-each": "^0.1.1",
    "gulp-eslint": "^4.0.2",
    "gulp-footer": "^1.1.1",
    "gulp-header": "^1.8.2",
    "gulp-imagine-64": "^1.0.1",
    "gulp-load-plugins": "^1.1.0",
    "gulp-mocha": "^2.2.0",
    "gulp-rename": "^1.2.2",
    "gulp-uglify": "^3.0.0",
    "gulp-util": "^3.0.7",
    "run-sequence": "^1.1.4",
    "vinyl-buffer": "^1.0.1",
    "vinyl-source-stream": "^2.0.0"
  }
}

},{}],25:[function(require,module,exports){
/* globals alert */

'use strict';

/**
 * @constructor
 * @desc Extend from this base class using `Base.extend` per example.
 * @example
 * var prototype = { ... };
 * var descendantClass = Base.extend(prototype};
 * @classdesc This is an abstract base class available for all Hypergrid classes.
 */
var Base = require('extend-me').Base;

Base.prototype.version = require('../package.json').version;
Base.prototype.deprecated = require('./lib/deprecated');
Base.prototype.HypergridError = require('./lib/error');

Base.prototype.notify = function(message, onerror) {
    switch (onerror) {
        case 'warn': console.warn(message); break;
        case 'alert': alert(message); break; // eslint-disable-line no-alert
        default: throw new this.HypergridError(message);
    }
};

/**
 * Convenience function for getting the value when that value can be defined as a function that needs to be called to get the actual (primitive) value.
 * @param value
 * @returns {*}
 */
Base.prototype.unwrap = function(value) {
    if ((typeof value)[0] === 'f') {
        value = value();
    }
    return value;
};

/**
 * @method
 * @summary Mixes source members into calling context.
 * @desc Context is typically either an instance or the (shared) prototype of a "class" extended from {@link Base} (see examples).
 *
 * Typically used by plug-ins.
 * @example
 * // define instance members: myGrid.fix(), etc.
 * myGrid.mixIn({ fix: function() {...}, ... });
 * @example
 * // define prototype members: Hypergrid.prototype.fix(), etc.
 * Hypergrid.prototype.mixIn({ fix: function() {...}, ... });
 * @See {@link https://joneit.github.io/overrider/module-overrider.htm#.mixIn}
 * @param {object} source
 */
Base.prototype.mixIn = require('overrider').mixIn;


/**
 * @method
 * @summary Instantiate an object with discrete + variable args.
 * @desc The discrete args are passed first, followed by the variable args.
 * @param {function} Constructor
 * @param {Array} variableArgArray
 * @param {...*} discreteArgs
 * @returns {object} Object of type `Constructor` newly constructor using the arguments in `arrayOfArgs`.
 */
Base.prototype.createApply = function(Constructor, variableArgArray, discreteArgs) {
    var discreteArgArray = Array.prototype.slice.call(arguments, 2),
        args = [null] // null is context for `bind` call below
            .concat(discreteArgArray) // discrete arguments
            .concat(variableArgArray), // variable arguments
        BoundConstructor = Constructor.bind.apply(Constructor, args);

    return new BoundConstructor;
};


module.exports = Base;

},{"../package.json":24,"./lib/deprecated":84,"./lib/error":86,"extend-me":15,"overrider":20}],26:[function(require,module,exports){
/* eslint-env browser */

'use strict';

var _ = require('object-iterators');


exports.mixin = {

    /**
     * @summary Add an event listener to me.
     * @desc Listeners added by this method should only be removed by {@link Hypergrid#removeEventListener|grid.removeEventListener} (or {@link Hypergrid#removeAllEventListeners|grid.removeAllEventListeners}).
     * @param {string} eventName - The type of event we are interested in.
     * @param {function} listener - The event handler.
     * @param {boolean} [internal=false] - Used by {@link Hypergrid#addInternalEventListener|grid.addInternalEventListener} (see).
     * @memberOf Hypergrid#
     */
    addEventListener: function(eventName, listener, internal) {
        var self = this,
            listeners = this.listeners[eventName] = this.listeners[eventName] || [],
            alreadyAttached = listeners.find(function(info) { return info.listener === listener; });

        if (!alreadyAttached) {
            var info = {
                internal: internal,
                listener: listener,
                decorator: function(e) {
                    if (self.allowEventHandlers) {
                        listener(e);
                    }
                }
            };
            listeners.push(info);
            this.canvas.addEventListener(eventName, info.decorator);
        }
    },

    /**
     * @summary Add an internal event listener to me.
     * @desc The new listener is flagged as "internal." Internal listeners are removed as usual by {@link Hypergrid#removeEventListener|grid.removeEventListener}. However, they are ignored by {@link Hypergrid#removeAllEventListeners|grid.removeAllEventListeners()} (as called by {@link Hypergrid#reset|reset}). (But see {@link Hypergrid#removeAllEventListeners|grid.removeAllEventListeners(true)}.)
     *
     * Listeners added by this method should only be removed by {@link Hypergrid#removeEventListener|grid.removeEventListener} (or {@link Hypergrid#removeAllEventListeners|grid.removeAllEventListeners(true)}).
     * @param {string} eventName - The type of event we are interested in.
     * @param {function} listener - The event handler.
     * @memberOf Hypergrid#
     */
    addInternalEventListener: function(eventName, listener) {
        this.addEventListener(eventName, listener, true);
    },

    /**
     * @summary Remove an event listeners.
     * @desc Removes the event listener with matching name and function that was added by {@link Hypergrid#addEventListener|grid.addEventListener}.
     *
     * NOTE: This method cannot remove event listeners added by other means.
     * @memberOf Hypergrid#
     */
    removeEventListener: function(eventName, listener) {
        var listenerList = this.listeners[eventName];

        if (listenerList) {
            listenerList.find(function(info, index) {
                if (info.listener === listener) {
                    if (listenerList.length === 1) {
                        delete this.listeners[eventName];
                    } else {
                        listenerList.splice(index, 1); // remove it from the list
                    }
                    this.canvas.removeEventListener(eventName, info.decorator);
                    return true;
                }
            }, this);
        }
    },

    /**
     * @summary Remove all event listeners.
     * @desc Removes all event listeners added with {@link Hypergrid#addEventListener|grid.addEventListener} except those added as "internal."
     * @param {boolean} [internal=false] - Include internal listeners.
     * @memberOf Hypergrid#
     */
    removeAllEventListeners: function(internal) {
        _(this.listeners).each(function(listenerList, key) {
            listenerList.slice().forEach(function(info) {
                if (internal || !info.internal) {
                    this.removeEventListener(key, info.listener);
                }
            }, this);
        }, this);
    },

    allowEvents: function(allow){
        this.allowEventHandlers = !!allow;

        if (this.behavior.featureChain) {
            if (allow){
                this.behavior.featureChain.attachChain();
            } else {
                this.behavior.featureChain.detachChain();
            }
        }

        this.behavior.changed();
    },

    /**
     * @memberOf Hypergrid#
     * @param {number} c - grid column index.
     * @param {string[]} keys
     */
    fireSyntheticColumnSortEvent: function(c, keys) {
        return dispatchEvent.call(this, 'fin-column-sort', {
            column: c,
            keys: keys
        });
    },

    fireSyntheticEditorKeyUpEvent: function(inputControl, keyEvent) {
        return dispatchEvent.call(this, 'fin-editor-keyup', {
            input: inputControl,
            keyEvent: keyEvent,
            char: this.canvas.getCharMap()[keyEvent.keyCode][keyEvent.shiftKey ? 1 : 0]
        });
    },

    fireSyntheticEditorKeyDownEvent: function(inputControl, keyEvent) {
        return dispatchEvent.call(this, 'fin-editor-keydown', {
            input: inputControl,
            keyEvent: keyEvent,
            char: this.canvas.getCharMap()[keyEvent.keyCode][keyEvent.shiftKey ? 1 : 0]
        });
    },

    fireSyntheticEditorKeyPressEvent: function(inputControl, keyEvent) {
        return dispatchEvent.call(this, 'fin-editor-keypress', {
            input: inputControl,
            keyEvent: keyEvent,
            char: this.canvas.getCharMap()[keyEvent.keyCode][keyEvent.shiftKey ? 1 : 0]
        });
    },

    fireSyntheticEditorDataChangeEvent: function(inputControl, oldValue, newValue) {
        return dispatchEvent.call(this, 'fin-editor-data-change', true, {
            input: inputControl,
            oldValue: oldValue,
            newValue: newValue
        });
    },

    /**
     * @memberOf Hypergrid#
     * @desc Synthesize and fire a `fin-row-selection-changed` event.
     */
    fireSyntheticRowSelectionChangedEvent: function() {
        return dispatchEvent.call(this, 'fin-row-selection-changed', this.selectionDetailGetters);
    },

    fireSyntheticColumnSelectionChangedEvent: function() {
        return dispatchEvent.call(this, 'fin-column-selection-changed', this.selectionDetailGetters);
    },

    /**
     * @memberOf Hypergrid#
     * @desc Synthesize and fire a `fin-context-menu` event
     * @param {keyEvent} event - The canvas event.
     */
    fireSyntheticContextMenuEvent: function(event) {
        Object.defineProperties(event, this.selectionDetailGetterDescriptors);
        return dispatchEvent.call(this, 'fin-context-menu', {}, event);
    },

    fireSyntheticMouseUpEvent: function(event) {
        Object.defineProperties(event, this.selectionDetailGetterDescriptors);
        return dispatchEvent.call(this, 'fin-mouseup', {}, event);
    },

    fireSyntheticMouseDownEvent: function(event) {
        Object.defineProperties(event, this.selectionDetailGetterDescriptors);
        return dispatchEvent.call(this, 'fin-mousedown', {}, event);
    },

    fireSyntheticMouseMoveEvent: function(event) {
        return dispatchEvent.call(this, 'fin-mousemove', {}, event);
    },

    fireSyntheticButtonPressedEvent: function(event) {
        if (this.isViewableButton(event.dataCell.x, event.gridCell.y)) {
            return dispatchEvent.call(this, 'fin-button-pressed', {}, event);
        }
    },

    /**
     * @memberOf Hypergrid#
     * @desc Synthesize and fire a `fin-column-drag-start` event.
     */
    fireSyntheticOnColumnsChangedEvent: function() {
        return dispatchEvent.call(this, 'fin-column-changed-event', {});
    },

    /**
     * @memberOf Hypergrid#
     * @desc Synthesize and fire a `fin-keydown` event.
     * @param {keyEvent} event - The canvas event.
     */
    fireSyntheticKeydownEvent: function(keyEvent) {
        return dispatchEvent.call(this, 'fin-keydown', keyEvent.detail);
    },

    /**
     * @memberOf Hypergrid#
     * @desc Synthesize and fire a `fin-keyup` event.
     * @param {keyEvent} event - The canvas event.
     */
    fireSyntheticKeyupEvent: function(keyEvent) {
        return dispatchEvent.call(this, 'fin-keyup', keyEvent.detail);
    },

    fireSyntheticFilterAppliedEvent: function() {
        return dispatchEvent.call(this, 'fin-filter-applied', {});
    },

    /**
     * @memberOf Hypergrid#
     * @desc Synthesize and fire a `fin-cell-enter` event
     * @param {Point} cell - The pixel location of the cell in which the click event occurred.
     * @param {MouseEvent} event - The system mouse event.
     */
    fireSyntheticOnCellEnterEvent: function(cellEvent) {
        return dispatchEvent.call(this, 'fin-cell-enter', cellEvent);
    },

    /**
     * @memberOf Hypergrid#
     * @desc Synthesize and fire a `fin-cell-exit` event.
     * @param {Point} cell - The pixel location of the cell in which the click event occured.
     * @param {MouseEvent} event - The system mouse event.
     */
    fireSyntheticOnCellExitEvent: function(cellEvent) {
        return dispatchEvent.call(this, 'fin-cell-exit', cellEvent);
    },

    /**
     * @memberOf Hypergrid#
     * @desc Synthesize and fire a `fin-cell-click` event.
     * @param {Point} cell - The pixel location of the cell in which the click event occured.
     * @param {MouseEvent} event - The system mouse event.
     */
    fireSyntheticClickEvent: function(cellEvent) {
        return dispatchEvent.call(this, 'fin-click', {}, cellEvent);
    },

    /**
     * @memberOf Hypergrid#
     * @desc Synthesize and fire a `fin-double-click` event.
     * @param {MouseEvent} event - The system mouse event.
     */
    fireSyntheticDoubleClickEvent: function(cellEvent) {
        if (!this.abortEditing()) { return; }

        return dispatchEvent.call(this, 'fin-double-click', {}, cellEvent);
    },

    /**
     * @memberOf Hypergrid#
     * @desc Synthesize and fire a rendered event.
     */
    fireSyntheticGridRenderedEvent: function() {
       return dispatchEvent.call(this, 'fin-grid-rendered', { source: this });
    },

    fireSyntheticTickEvent: function() {
        return dispatchEvent.call(this, 'fin-tick', { source: this });
    },

    fireSyntheticGridResizedEvent: function(e) {
        return dispatchEvent.call(this, 'fin-grid-resized', e);
    },

    /**
     * @memberOf Hypergrid#
     * @desc Synthesize and fire a scroll event.
     * @param {string} type - Should be either `fin-scroll-x` or `fin-scroll-y`.
     * @param {number} oldValue - The old scroll value.
     * @param {number} newValue - The new scroll value.
     */
    fireScrollEvent: function(eventName, oldValue, newValue) {
        return dispatchEvent.call(this, eventName, {
            oldValue: oldValue,
            value: newValue
        });
    },

    fireRequestCellEdit: function(cellEvent, value) {
        return dispatchEvent.call(this, 'fin-request-cell-edit', true, { value: value }, cellEvent);
    },

    /**
     * @memberOf Hypergrid#
     * @desc Synthesize and fire a fin-before-cell-edit event.
     * @param {Point} cell - The x,y coordinates.
     * @param {Object} value - The current value.
     * @returns {boolean} Proceed (don't cancel).
     */
    fireBeforeCellEdit: function(cellEvent, oldValue, newValue, control) {
        return dispatchEvent.call(this, 'fin-before-cell-edit', true, {
            oldValue: oldValue,
            newValue: newValue,
            input: control
        }, cellEvent);
    },

    /**
     * @memberOf Hypergrid#
     * @returns {Renderer} sub-component
     * @param {Point} cell - The x,y coordinates.
     * @param {Object} oldValue - The old value.
     * @param {Object} newValue - The new value.
     */
    fireAfterCellEdit: function(cellEvent, oldValue, newValue, control) {
        return dispatchEvent.call(this, 'fin-after-cell-edit', {
            newValue: newValue,
            oldValue: oldValue,
            input: control
        }, cellEvent);
    },

    /**
     * @memberOf Hypergrid#
     * @desc Synthesize and fire a `fin-column-drag-start` event.
     */
    fireDataChangedEvent: function(repaint) {
        if (repaint) {
            this.repaint();
        }
        return dispatchEvent.call(this, 'fin-data-changed', {});
    },

    delegateCanvasEvents: function() {
        var self = this;

        function handleMouseEvent(e, cb) {
            if (self.getRowCount() === 0) {
                return;
            }

            var c = self.getGridCellFromMousePoint(e.detail.mouse),
                primitiveEvent,
                decoratedEvent;

            // No events on the whitespace of the grid unless they're drag events
            if (!c.fake || e.detail.dragstart) {
                primitiveEvent = c.cellEvent;
            }

            if (primitiveEvent) {
                decoratedEvent = Object.defineProperty(
                    primitiveEvent,
                    'primitiveEvent',
                    {
                        value: e,
                        enumerable: false,
                        configurable: true,
                        writable: true
                    }
                );
                cb.call(self, decoratedEvent);
            }
        }

        this.addInternalEventListener('fin-canvas-resized', function(e) {
            self.resized();
            self.fireSyntheticGridResizedEvent(e);
        });

        this.addInternalEventListener('fin-canvas-mousemove', function(e) {
            if (self.properties.readOnly) {
                return;
            }
            handleMouseEvent(e, function(mouseEvent) {
                this.delegateMouseMove(mouseEvent);
                this.fireSyntheticMouseMoveEvent(mouseEvent);
            });
        });

        this.addInternalEventListener('fin-canvas-mousedown', function(e) {
            if (self.properties.readOnly) {
                return;
            }
            if (!self.abortEditing()) {
                event.stopPropagation();
                return;
            }

            handleMouseEvent(e, function(mouseEvent) {
                mouseEvent.keys = e.detail.keys;
                this.mouseDownState = mouseEvent;
                this.delegateMouseDown(mouseEvent);
                this.fireSyntheticMouseDownEvent(mouseEvent);
                this.repaint();
            });
        });

        this.addInternalEventListener('fin-canvas-click', function(e) {
            if (self.properties.readOnly) {
                return;
            }
            handleMouseEvent(e, function(mouseEvent) {
                mouseEvent.keys = e.detail.keys; // todo: this was in fin-tap but wasn't here
                this.fireSyntheticClickEvent(mouseEvent);
                this.delegateClick(mouseEvent);
            });
        });

        this.addInternalEventListener('fin-canvas-mouseup', function(e) {
            if (self.properties.readOnly) {
                return;
            }
            self.dragging = false;
            if (self.isScrollingNow()) {
                self.setScrollingNow(false);
            }
            if (self.columnDragAutoScrolling) {
                self.columnDragAutoScrolling = false;
            }
            handleMouseEvent(e, function(mouseEvent) {
                this.delegateMouseUp(mouseEvent);
                if (self.mouseDownState) {
                    self.fireSyntheticButtonPressedEvent(self.mouseDownState);
                }
                this.mouseDownState = null;
                this.fireSyntheticMouseUpEvent(mouseEvent);
            });
        });

        this.addInternalEventListener('fin-canvas-dblclick', function(e) {
            if (self.properties.readOnly) {
                return;
            }
            handleMouseEvent(e, function(mouseEvent) {
                this.fireSyntheticDoubleClickEvent(mouseEvent, e);
                this.delegateDoubleClick(mouseEvent);
            });
        });

        this.addInternalEventListener('fin-canvas-drag', function(e) {
            if (self.properties.readOnly) {
                return;
            }
            self.dragging = true;
            handleMouseEvent(e, self.delegateMouseDrag);
        });

        this.addInternalEventListener('fin-canvas-keydown', function(e) {
            if (self.properties.readOnly) {
                return;
            }
            self.fireSyntheticKeydownEvent(e);
            self.delegateKeyDown(e);
        });

        this.addInternalEventListener('fin-canvas-keyup', function(e) {
            if (self.properties.readOnly) {
                return;
            }
            self.fireSyntheticKeyupEvent(e);
            self.delegateKeyUp(e);
        });

        this.addInternalEventListener('fin-canvas-wheelmoved', function(e) {
            handleMouseEvent(e, self.delegateWheelMoved);
        });

        this.addInternalEventListener('fin-canvas-mouseout', function(e) {
            if (self.properties.readOnly) {
                return;
            }
            handleMouseEvent(e, self.delegateMouseExit);
        });

        this.addInternalEventListener('fin-canvas-context-menu', function(e) {
            handleMouseEvent(e, function(mouseEvent){
                self.delegateContextMenu(mouseEvent);
                self.fireSyntheticContextMenuEvent(mouseEvent);
            });
        });

        //Register a listener for the copy event so we can copy our selected region to the pastebuffer if conditions are right.
        document.body.addEventListener('copy', function(evt) {
            self.checkClipboardCopy(evt);
        });
    },

    /**
     * @memberOf Hypergrid#
     * @desc Delegate the wheel moved event to the behavior.
     * @param {Event} event - The pertinent event.
     */
    delegateWheelMoved: function(event) {
        this.behavior.onWheelMoved(this, event);
    },

    /**
     * @memberOf Hypergrid#
     * @desc Delegate MouseExit to the behavior (model).
     * @param {Event} event - The pertinent event.
     */
    delegateMouseExit: function(event) {
        this.behavior.handleMouseExit(this, event);
    },

    /**
     * @memberOf Hypergrid#
     * @desc Delegate MouseExit to the behavior (model).
     * @param {Event} event - The pertinent event.
     */
    delegateContextMenu: function(event) {
        this.behavior.onContextMenu(this, event);
    },

    /**
     * @memberOf Hypergrid#
     * @desc Delegate MouseMove to the behavior (model).
     * @param {mouseDetails} mouseDetails - An enriched mouse event from fin-canvas.
     */
    delegateMouseMove: function(mouseDetails) {
        this.behavior.onMouseMove(this, mouseDetails);
    },

    /**
     * @memberOf Hypergrid#
     * @desc Delegate mousedown to the behavior (model).
     * @param {mouseDetails} mouseDetails - An enriched mouse event from fin-canvas.
     */
    delegateMouseDown: function(mouseDetails) {
        this.behavior.handleMouseDown(this, mouseDetails);
    },

    /**
     * @memberOf Hypergrid#
     * @desc Delegate mouseup to the behavior (model).
     * @param {mouseDetails} mouseDetails - An enriched mouse event from fin-canvas.
     */
    delegateMouseUp: function(mouseDetails) {
        this.behavior.onMouseUp(this, mouseDetails);
    },

    /**
     * @memberOf Hypergrid#
     * @desc Delegate click to the behavior (model).
     * @param {mouseDetails} mouseDetails - An enriched mouse event from fin-canvas.
     */
    delegateClick: function(mouseDetails) {
        this.behavior.onClick(this, mouseDetails);
    },

    /**
     * @memberOf Hypergrid#
     * @desc Delegate mouseDrag to the behavior (model).
     * @param {mouseDetails} mouseDetails - An enriched mouse event from fin-canvas.
     */
    delegateMouseDrag: function(mouseDetails) {
        this.behavior.onMouseDrag(this, mouseDetails);
    },

    /**
     * @memberOf Hypergrid#
     * @desc We've been doubleclicked on. Delegate through the behavior (model).
     * @param {mouseDetails} mouseDetails - An enriched mouse event from fin-canvas.
     */
    delegateDoubleClick: function(mouseDetails) {
        this.behavior.onDoubleClick(this, mouseDetails);
    },

    /**
     * @memberOf Hypergrid#
     * @summary Generate a function name and call it on self.
     * @desc This should also be delegated through Behavior keeping the default implementation here though.
     * @param {event} event - The pertinent event.
     */
    delegateKeyDown: function(event) {
        this.behavior.onKeyDown(this, event);
    },

    /**
     * @memberOf Hypergrid#
     * @summary Generate a function name and call it on self.
     * @desc This should also be delegated through Behavior keeping the default implementation here though.
     * @param {event} event - The pertinent event.
     */
    delegateKeyUp: function(event) {
        this.behavior.onKeyUp(this, event);
    },
};

var details = [
    'gridCell',
    'dataCell',
    'mousePoint',
    'keys',
    'row'
];

/**
 *
 * @param {string} eventName
 * @param {boolean} [cancelable=false]
 * @param {object} event
 * @param {CellEvent|MouseEvent|KeyboardEvent|object} [primitiveEvent]
 * @returns {undefined|boolean}
 */
function dispatchEvent(eventName, cancelable, event, primitiveEvent) {
    var detail, result;

    if (typeof cancelable !== 'boolean') {
        primitiveEvent = event; // propmote primitiveEvent to 3rd position
        event = cancelable; // promote event to 2nd position
        cancelable = false; // default when omitted
    }

    if (!event.detail) {
        event = { detail: event };
    }

    detail = event.detail;

    if (!detail.grid) { // CellEvent objects already have a (read-only) `grid` prop
        detail.grid = this;
    }

    detail.time = Date.now();

    if (primitiveEvent) {
        if (!detail.primitiveEvent) {
            detail.primitiveEvent = primitiveEvent;
        }
        details.forEach(function(key) {
            if (key in primitiveEvent && !(key in detail)) {
                detail[key] = primitiveEvent[key];
            }
        });
        if ('dataRow' in primitiveEvent) {
            // reference (without invoking) cellEvent's `dataRow` getter when available
            Object.defineProperty(detail, 'row', { get: function() { return primitiveEvent.dataRow; } });
        }
    }

    if (cancelable) {
        event.cancelable = true;
    }

    result = this.canvas.dispatchEvent(new CustomEvent(eventName, event));

    if (cancelable) {
        return result;
    }
}

},{"object-iterators":19}],27:[function(require,module,exports){
/* eslint-env browser */

'use strict';

require('../lib/polyfills'); // Installs misc. polyfills into global objects, as needed

var Point = require('rectangular').Point;
var Rectangle = require('rectangular').Rectangle;
var _ = require('object-iterators'); // fyi: installs the Array.prototype.find polyfill, as needed
var injectCSS = require('inject-stylesheet-template').bind(require('../../css/index'));

var Base = require('../Base');
var themes = require('./themes');
var defaults = require('../defaults');
var dynamicPropertyDescriptors = require('../lib/dynamicProperties');
var Canvas = require('../lib/Canvas');
var Renderer = require('../renderer/index');
var SelectionModel = require('../lib/SelectionModel');
var Localization = require('../lib/Localization');
var Behavior = require('../behaviors/Behavior');
var behaviorJSON = require('../behaviors/JSON');
var CellRenderers = require('../cellRenderers');
var CellEditors = require('../cellEditors');

var EDGE_STYLES = ['top', 'bottom', 'left', 'right'],
    RECT_STYLES = EDGE_STYLES.concat(['width', 'height', 'position']);

/**
 * @mixes scrolling.mixin
 * @mixes events.mixin
 * @mixes selection.mixin
 * @mixes themes.instanceMixin
 * @constructor
 * @param {string|Element} [container] - CSS selector or Element
 * @param {object} [options]
 * @param {function} [options.Behavior=behaviors.JSON] - A grid behavior constructor (extended from {@link Behavior}).
 * @param {function|object[]} [options.data] - Passed to behavior constructor. May be:
 * * An array of congruent raw data objects
 * * A function returning same
 * @param {function|menuItem[]} [options.schema=derivedSchema] - Passed to behavior constructor. May be:
 * * A schema array
 * * A function returning a schema array. Called at filter reset time with behavior as context.
 * * Omit to generate a basic schema from `this.behavior.columns`.
 *
 * @param {pluginSpec|pluginSpec[]} [options.plugins]
 *
 * @param {subgridSpec[]} [options.subgrids]
 *
 * @param {object} [options.state]
 *
 * @param {string|Element} [options.container] - CSS selector or Element
 *
 * @param {string} [options.localization=Hypergrid.localization]
 * @param {string|string[]} [options.localization.locale=Hypergrid.localization.locale] - The default locale to use when an explicit `locale` is omitted from localizer constructor calls. Passed to Intl.NumberFomrat` and `Intl.DateFomrat`. See {@ https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Intl#Locale_identification_and_negotiation|Locale identification and negotiation} for more information.
 * @param {string} [options.localization.numberOptions=Hypergrid.localization.numberOptions] - Options passed to `Intl.NumberFormat` for creating the basic "number" localizer.
 * @param {string} [options.localization.dateOptions=Hypergrid.localization.dateOptions] - Options passed to `Intl.DateFomrat` for creating the basic "date" localizer.
 *
 * @param {object} [options.schema]
 *
 * @param {object} [options.margin] - Optional canvas "margins" applied to containing div as .left, .top, .right, .bottom. (Default values actually derive from 'grid' stylesheet's `.hypergrid-container` rule.)
 * @param {string} [options.margin.top='0px']
 * @param {string} [options.margin.right='0px']
 * @param {string} [options.margin.bottom='0px']
 * @param {string} [options.margin.left='0px']
 *
 * @param {object} [options.boundingRect] - Optional grid container size & position. (Default values actually derive from 'grid' stylesheet's `.hypergrid-container > div:first-child` rule.)
 * @param {string} [options.boundingRect.height='500px']
 * @param {string} [options.boundingRect.width='auto']
 * @param {string} [options.boundingRect.left='auto']
 * @param {string} [options.boundingRect.top='auto']
 * @param {string} [options.boundingRect.right='auto']
 * @param {string} [options.boundingRect.bottom='auto']
 * @param {string} [options.boundingRect.position='relative']
 */
var Hypergrid = Base.extend('Hypergrid', {
    initialize: function(container, options) {
        this.selectionInitialize();

        //Optional container argument
        if (!(typeof container === 'string') && !(container instanceof HTMLElement)) {
            options = container;
            container = null;
        }

        this.options = options = options || {};

        this.clearState();

        //Set up the container for a grid instance
        this.setContainer(
            container ||
            options.container ||
            findOrCreateContainer(options.boundingRect)
        );

        // Install shared plug-ins (those with a `preinstall` method)
        Hypergrid.prototype.installPlugins(options.plugins);

        this.lastEdgeSelection = [0, 0];
        this.isWebkit = navigator.userAgent.toLowerCase().indexOf('webkit') > -1;
        this.selectionModel = new SelectionModel(this);
        this.renderOverridesCache = {};
        this.allowEventHandlers = true;
        this.dragExtent = new Point(0, 0);
        this.numRows = 0;
        this.numColumns = 0;
        this.clearMouseDown();
        this.setFormatter(options.localization);
        this.listeners = {};

        /**
         * @name cellRenderers
         * @type {CellRenderer}
         * @memberOf Hypergrid#
         */
        this.cellRenderers = new CellRenderers();

        /**
         * @name cellEditors
         * @type {CellEditor}
         * @memberOf Hypergrid#
         */
        this.cellEditors = new CellEditors({ grid: this });

        if (this.options.Behavior) {
            this.setBehavior(this.options); // also sets this.options.data
        } else if (this.options.data) {
            this.setData(this.options.data, this.options); // if no behavior has yet been set, `setData` sets a default behavior
        }

        if (this.options.state) {
            this.loadState(this.options.state);
        }

        /**
         * @name plugins
         * @summary Dictionary of named instance plug-ins.
         * @desc See examples for how to reference (albeit there is normally no need to reference plugins directly).
         *
         * For the dictionary of _shared_ plugins, see {@link Hypergrid.plugins|plugins} (a property of the constructor).
         * @example
         * var instancePlugins = myGrid.plugins;
         * var instancePlugins = this.plugins; // internal use
         * var myInstancePlugin = myGrid.plugins.myInstancePlugin;
         * @type {object}
         * @memberOf Hypergrid#
         */
        this.plugins = {};

        // Install instance plug-ins (those that are constructors OR have an `install` method)
        this.installPlugins(options.plugins);

        // Listen for propagated mouseclicks. Used for aborting edit mode.
        document.addEventListener('mousedown', this.mouseCatcher = function() {
            this.abortEditing();
        }.bind(this));

        setTimeout(this.repaint.bind(this));
    },

    terminate: function() {
        document.removeEventListener('mousedown', this.mouseCatcher);
    },

    /**
     *
     * A null object behavior serves as a place holder.
     * @type {object}
     * @memberOf Hypergrid#
     */
    behavior: null,

    /**
     * Cached resulan}
     * @memberOf Hypergrid#
     */
    isWebkit: true,

    /**
     * The pixel location of an initial mousedown click, either for editing a cell or for dragging a selection.
     * @type {Point}
     * @memberOf Hypergrid#
     */
    mouseDown: [],

    /**
     * The extent from the mousedown point during a drag operation.
     * @type {Point}
     * @memberOf Hypergrid#
     */

    dragExtent: null,

    /**
     * @property {fin-hypergrid-selection-model} selectionModel - A [fin-hypergrid-selection-model](module-._selection-model.html) instance.
     * @memberOf Hypergrid#
     */
    selectionModel: null,

    /**
     * @property {fin-hypergrid-cell-editor} cellEditor - The current instance of [fin-hypergrid-cell-editor](module-cell-editors_base.html).
     * @memberOf Hypergrid#
     */
    cellEditor: null,

    /**
     * @property {fin-vampire-bar} sbHScroller - An instance of {@link https://github.com/openfin/finbars|FinBar}.
     * @memberOf Hypergrid#
     */
    sbHScroller: null,

    /**
     * is the short term memory of what column I might be dragging around
     * @type {object}
     * @memberOf Hypergrid#
     */

    renderOverridesCache: {},

    /**
     * The pixel location of the current hovered cell.
     * @todo Need to detect hovering over bottom totals.
     * @type {Point}
     * @memberOf Hypergrid#
     */
    hoverCell: null,

    lastEdgeSelection: null,

    /**
     * @memberOf Hypergrid#
     */
    setAttribute: function(attribute, value) {
        this.div.setAttribute(attribute, value);
    },

    /**
     * @memberOf Hypergrid#
     */
    clearState: function() {
        /**
         * @name properties
         * @type {object}
         * @summary Object containing the properties of the grid.
         * @desc Grid properties objects have the following structure:
         * 1. User-configured properties and dynamic properties are in the "own" layer.
         * 2. Extends from the theme object.
         * 3. The theme object in turn extends from the {@link module:defaults|defaults} object.
         *
         * Note: Any changes the application developer may wish to make to the {@link module:defaults|defaults}
         * object should be made _before_ reaching this point (_i.e.,_ prior to any grid instantiations).
         * @memberOf Hypergrid#
         */
        this.properties = Object.defineProperties(this.initThemeLayer(), {
            grid: { value: this },
            var: { value: new Var() }
        });

        // For all all default props of object type, if a dynamic prop, invoke setter; else deep clone it so changes
        // made to inner props won't go to object on theme or defaults layers which are shared by other instances.
        Object.keys(defaults).forEach(function(key) {
            var value = defaults[key];
            if (typeof value === 'object') {
                if (dynamicPropertyDescriptors[key]) {
                    this[key] = value; // invoke dynamic prop setter
                } else {
                    this[key] = deepClone(value); // just a plain object
                }
            }
        }, this.properties);
    },

    /**
     * @desc Clear out all state settings, data (rows), and schema (columns) of a grid instance.
     * @param {object} [options]
     * @param {object} [options.subgrids] - Consumed by {@link Behavior#reset}.
     * If omitted, previously established subgrids list is reused.
     * @memberOf Hypergrid#
     */
    reset: function(options) {
        this.clearState();

        this.removeAllEventListeners();

        this.lastEdgeSelection = [0, 0];
        this.selectionModel.reset();
        this.renderOverridesCache = {};
        this.clearMouseDown();
        this.dragExtent = new Point(0, 0);

        this.numRows = 0;
        this.numColumns = 0;

        this.vScrollValue = 0;
        this.hScrollValue = 0;

        this.cancelEditing();

        this.sbPrevVScrollValue = null;
        this.sbPrevHScrollValue = null;

        this.hoverCell = null;
        this.scrollingNow = false;
        this.lastEdgeSelection = [0, 0];

        this.behavior.reset({
            subgrids: options && options.subgrids
        });

        this.renderer.reset();
        this.canvas.resize();
        this.behaviorChanged();

        this.refreshProperties();
    },

    /** @typedef {object|function|Array} pluginSpec
     * @desc One of:
     * * simple API - a plain object with an `install` method
     * * object API - an object constructor
     * * array:
     *    * first element is an optional name for the API or the newly instantiated object
     *    * next element (or first element when not a string) is the simple or object API
     *    * remaining arguments are optional arguments for the object constructor
     * * falsy value such as `undefined` - ignored
     *
     * The API may have a `name` or `$$CLASS_NAME` property.
     */
    /**
     * @summary Install plugins.
     * @desc Plugin installation:
     * * Each simple API is installed by calling it's `install` method with `this` as first arg + any additional args listed in the `pluginSpec` (when it is an array).
     * * Each object API is installed by instantiating it's constructor with `this` as first arg + any additional args listed in the `pluginSpec` (when it is an array).
     *
     * The resulting plain object or instantiated objects may be named by (in priority order):
     * 1. if `pluginSpec` contains an array and first element is a string
     * 2. object has a `name` property
     * 3. object has a `$$CLASS_NAME` property
     *
     * If named, a reference to each object is saved in `this.plugins`. If the plug-in is unnamed, no reference is kept.
     *
     * There are two types of plugin installations:
     * * Preinstalled plugins which are installed on the prototype. These are simple API plugins with a `preinstall` method called with the `installPlugins` calling context as the first argument. Preinstallations are automatically performed whenever a grid is instantiated (at the beginning of the constructor), by calling `installPlugins` with `Hypergrid.prototype` as the calling context.
     * * Regular plugins which are installed on the instance. These are simple API plugins with an `install` method, as well as all object API plugins (constructors), called with the `installPlugins` calling context as the first argument. These installations are automatically performed whenever a grid is instantiated (at the end of the constructor), called with the new grid instance as the calling context.
     *
     * The "`installPlugins` calling context" means either the grid instance or its prototype, depending on how this method is called.
     *
     * Plugins may have both `preinstall` _and_ `install` methods, in which case both will be called. However, note that in any case, `install` methods on object API plugins are ignored.
     *
     * @this {Hypergrid}
     * @param {pluginSpec|pluginSpec[]} [plugins] - The plugins to install. If omitted, the call is a no-op.
     * @memberOf Hypergrid#
     */
    installPlugins: function(plugins) {
        var shared = this === Hypergrid.prototype; // Do shared ("preinstalled") plugins (if any)

        if (!plugins) {
            return;
        } else if (!Array.isArray(plugins)) {
            plugins = [plugins];
        }

        plugins.forEach(function(plugin) {
            var name, args, hash;

            if (!plugin) {
                return; // ignore falsy plugin spec
            }

            // set first arg of constructor to `this` (the grid instance)
            // set first arg of `install` method to `this` (the grid instance)
            // set first two args of `preinstall` method to `this` (the Hypergrid prototype) and the Behavior prototype
            args = [this];
            if (shared) {
                args.push(Behavior.prototype);
            }

            if (Array.isArray(plugin)) {
                if (!plugin.length) {
                    plugin = undefined;
                } else if (typeof plugin[0] !== 'string') {
                    args = args.concat(plugin.slice(1));
                    plugin = plugin[0];
                } else if (plugin.length >= 2) {
                    args = args.concat(plugin.slice(2));
                    name = plugin[0];
                    plugin = plugin[1];
                } else {
                    plugin = undefined;
                }
            }

            if (!plugin) {
                return; // ignore empty array or array with single string element
            }

            // Derive API name if not given in pluginSpec
            name = name || plugin.name || plugin.$$CLASS_NAME;
            if (name) {
                // Translate first character to lower case
                name = name.substr(0, 1).toLowerCase() + name.substr(1);
            }

            if (shared) {
                // Execute the `preinstall` method
                hash = this.constructor.plugins;
                if (plugin.preinstall && !hash[name]) {
                    plugin.preinstall.apply(plugin, args);
                }
            } else { // instance plug-ins:
                hash = this.plugins;
                if (typeof plugin === 'function') {
                    // Install "object API" by instantiating
                    plugin = this.createApply(plugin, args);
                } else if (plugin.install) {
                    // Install "simple API" by calling its `install` method
                    plugin.install.apply(plugin, args);
                } else if (!plugin.preinstall) {
                    throw new Base.prototype.HypergridError('Expected plugin (a constructor; or an API with a `preinstall` method and/or an `install` method).');
                }
            }

            if (name) {
                hash[name] = plugin;
            }

        }, this);
    },

    /**
     * @summary Uninstall all uninstallable plugins or just named plugins.
     * @desc Calls `uninstall` on plugins that define such a method.
     *
     * To uninstall "preinstalled" plugins, call with `Hypergrid.prototype` as context.
     *
     * For convenience, the following args are passed to the call:
     * * `this` - the plugin to be uninstalled
     * * `grid` - the hypergrid object
     * * `key` - name of the plugin to be uninstalled (_i.e.,_ key in `plugins`)
     * * `plugins` - the plugins hash (a.k.a. `grid.plugins`)
     * @param {string|stirng[]} [pluginNames] If provided, limit uninstall to the named plugin (string) or plugins (string[]).
     * @memberOf Hypergrid#
     */
    uninstallPlugins: function(pluginNames) {
        if (!pluginNames) {
            pluginNames = [];
        } else if (!Array.isArray(pluginNames)) {
            pluginNames = [pluginNames];
        }
        _(this.plugins).each(function(plugin, key, plugins) {
            if (
                plugins.hasOwnProperty(key) &&
                pluginNames.indexOf(key) >= 0 &&
                plugin.uninstall
            ) {
                plugin.uninstall(this, key, plugins);
            }
        }, this);
    },

    computeCellsBounds: function() {
        this.renderer.computeCellsBounds();
    },

    setFormatter: function(options) {
        options = options || {};
        this.localization = new Localization(
            options.locale || Hypergrid.localization.locale,
            options.numberOptions || Hypergrid.localization.numberOptions,
            options.dateOptions || Hypergrid.localization.dateOptions
        );
    },

    getFormatter: function(localizerName) {
        return this.localization.get(localizerName).format;
    },

    formatValue: function(localizerName, value) {
        var formatter = this.getFormatter(localizerName);
        return formatter(value);
    },


    /**
     * @memberOf Hypergrid#
     * @desc Set the cell under the cursor.
     * @param {CellEvent} cellEvent
     */
    setHoverCell: function(cellEvent) {
        var hoverCell = this.hoverCell;
        if (!hoverCell || !hoverCell.equals(cellEvent.gridCell)) {
            this.hoverCell = cellEvent.gridCell;
            if (hoverCell) {
                this.fireSyntheticOnCellExitEvent(cellEvent);
            }
            this.fireSyntheticOnCellEnterEvent(cellEvent);
            this.repaint();
        }
    },

    /**
     * @memberOf Hypergrid#
     * @desc Amend properties for this hypergrid only.
     * @param {object} moreProperties - A simple properties hash.
     */
    addProperties: function(properties) {
        Object.assign(this.properties, properties);
        this.refreshProperties();
    },

    /**
     * @todo deprecate this in favor of making properties dynamic instead (for those that need to be)
     * @memberOf Hypergrid#
     * @desc Utility function to push out properties if we change them.
     * @param {object} properties - An object of various key value pairs.
     */
    refreshProperties: function() {
        this.behaviorShapeChanged();
        this.behavior.defaultRowHeight = null;
        this.behavior.autosizeAllColumns();
    },

    /**
     * @memberOf Hypergrid#
     * @desc Set the state object to return to the given user configuration.
     * @param {object} state - A memento object.
     * @see [Memento pattern](http://en.wikipedia.org/wiki/Memento_pattern)
     */
    setState: function(state) {
        this.behavior.setState(state);
        this.refreshProperties();
        this.behaviorChanged();
    },

    getState: function() {
        return this.behavior.getState();
    },

    loadState: function(state) {
        this.behavior.setState(state);
    },

    /**
     * @todo Only output values when they differ from defaults (deep compare needed).
     * @param {object} [options]
     * @param {string[]} [options.blacklist] - List of grid properties to exclude. Pertains to grid own properties only.
     * @param {boolean} [options.compact] - Run garbage collection first. The only property this current affects is `properties.calculators` (removes unused calculators).
     * @param {number|string} [options.space='\t'] - For no space, give `0`. (See {@link https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/JSON/stringify|JSON.stringify}'s `space` param other options.)
     * @param {function} [options.headerify] - If your headers were generated by a function (taking column name as a parameter), give a reference to that function here to avoid persisting headers that match the generated string.
     * @memberOf Hypergrid#
     */
    saveState: function(options) {
        options = options || {};

        var space = options.space === undefined ? '\t' : options.space,
            properties = this.properties,
            calculators = properties.calculators;

        if (calculators) {
            if (options.compact) {
                var columns = this.behavior.getColumns();
                Object.keys(calculators).forEach(function(key) {
                    if (!columns.find(function(column) {
                            return column.properties.calculator === calculators[key];
                        })) {
                        delete calculators[key];
                    }
                });
            }
            calculators.toJSON = stringifyFunctions;
        }

        // Temporarily copy the given headerify function for access by columns getter
        this.headerify = options.headerify;

        var json = JSON.stringify(properties, function(key, value) {
            if (options.blacklist && this === properties && options.blacklist.indexOf(key) >= 0) {
                value = undefined;
            } else if (key === 'calculator') {
                if (calculators) {
                    // convert function reference to registry key
                    value = Object.keys(calculators).find(function(key) {
                        return calculators[key] === value;
                    });
                } else {
                    // registry may not exist if Column.calculator setter was used directly so just save as is
                    value = value.toString();
                }
            }
            return value;
        }, space);

        // Remove the temporary copy
        delete this.headerify;

        return json;
    },

    /**
     * @memberOf Hypergrid#
     * @returns {object} The initial mouse position on a mouse down event for cell editing or a drag operation.
     * @memberOf Hypergrid#
     */
    getMouseDown: function() {
        if (this.mouseDown.length) {
            return this.mouseDown[this.mouseDown.length - 1];
        }
    },

    /**
     * @memberOf Hypergrid#
     * @desc Remove the last item from the mouse down stack.
     */
    popMouseDown: function() {
        var result;
        if (this.mouseDown.length) {
            result = this.mouseDown.pop();
        }
        return result;
    },

    /**
     * @memberOf Hypergrid#
     * @desc Empty out the mouse down stack.
     */
    clearMouseDown: function() {
        this.mouseDown = [new Point(-1, -1)];
        this.dragExtent = null;
    },

    /**
     * Set the mouse point that initiated a cell edit or drag operation.
     * @param {Point} point
     * @memberOf Hypergrid#
     */
    setMouseDown: function(point) {
        this.mouseDown.push(point);
    },

    /**
     * @memberOf Hypergrid#
     * @returns {Point} The extent point of the current drag selection rectangle.
     */
    getDragExtent: function() {
        return this.dragExtent;
    },

    /**
     * @memberOf Hypergrid#
     * @summary Set the extent point of the current drag selection operation.
     * @param {Point} point
     */
    setDragExtent: function(point) {
        this.dragExtent = point;
    },

    /**
     * @memberOf Hypergrid#
     * @desc This function is a callback from the HypergridRenderer sub-component. It is called after each paint of the canvas.
     */
    gridRenderedNotification: function() {
        if (this.cellEditor) {
            this.cellEditor.gridRenderedNotification();
        }
        this.checkColumnAutosizing();
        this.fireSyntheticGridRenderedEvent();
    },

    tickNotification: function() {
        this.fireSyntheticTickEvent();
    },

    /**
     * @memberOf Hypergrid#
     * @desc The grid has just been rendered, make sure the column widths are optimal.
     */
    checkColumnAutosizing: function() {
        this.behavior.autoSizeRowNumberColumn();
        if (this.behavior.checkColumnAutosizing(false)) {
            this.behaviorShapeChanged();
        }
    },

    /**
     * @memberOf Hypergrid#
     * @summary Conditionally copy to clipboard.
     * @desc If we have focus, copy our current selection data to the system clipboard.
     * @param {event} event - The copy system event.
     */
    checkClipboardCopy: function(event) {
        if (this.hasFocus()) {
            event.preventDefault();
            var csvData = this.getSelectionAsTSV();
            event.clipboardData.setData('text/plain', csvData);
        }
    },

    /**
     * @memberOf Hypergrid#
     * @returns {boolean} We have focus.
     */
    hasFocus: function() {
        return this.canvas.hasFocus();
    },

    /**
     * @memberOf Hypergrid#
     * @summary Set the Behavior (model) object for this grid control.
     * @desc This can be done dynamically.
     * @param {object} [options] - _(See {@link behaviors.JSON#setData}.)_
     * @param {Behavior} [options.behavior=behaviors.JSON] - The behavior (model) can be either a constructor or an instance.
     * @param {dataRowObject[]} [options.data] - _(See {@link behaviors.JSON#setData}.)_
     */
    setBehavior: function(options) {
        if (!this.behavior) {
            // If we get here it means:
            // 1. Called from constructor because behavior included in options object.
            // 2. Called from `setData` _and_ wasn't called explicitly since instantiation

            var Behavior = options && options.Behavior || behaviorJSON;
            this.behavior = new Behavior(this, options);
            this.initCanvas();
            this.initScrollbars();
            this.refreshProperties();
            this.behavior.reindex();
        }
    },

    /**
     * @memberOf Hypergrid#
     * @summary Set the underlying datasource.
     * @desc This can be done dynamically.
     * @param {function|object[]} dataRows - May be:
     * * An array of congruent raw data objects.
     * * A function returning same.
     * @param {object} [options] - _(See {@link behaviors.JSON#setData}.)_
     */
    setData: function(dataRows, options) {
        // Call `setBehavior` here just in case not previously set by constructor _or_ explicitly since instantiation
        this.setBehavior(options);
        this.behavior.setData(dataRows, options);
        this.setInfo(dataRows.length ? '' : this.properties.noDataMessage);
        this.behavior.changed();
    },

    setInfo: function(messages) {
        this.renderer.setInfo(messages);
    },

    /**
     * @memberOf Hypergrid#
     * @desc I've been notified that the behavior has changed.
     */
    behaviorChanged: function() {
        if (this.divCanvas) {
            if (this.numColumns !== this.getColumnCount() || this.numRows !== this.getRowCount()) {
                this.numColumns = this.getColumnCount();
                this.numRows = this.getRowCount();
                this.behaviorShapeChanged();
            } else {
                this.behaviorStateChanged();
            }
        }
    },

    /**
     * @memberOf Hypergrid#
     * @desc The dimensions of the grid data have changed. You've been notified.
     */
    behaviorShapeChanged: function() {
        this.needsShapeChanged = true;
        this.repaint();
    },

    /**
     * @memberOf Hypergrid#
     * @desc The dimensions of the grid data have changed. You've been notified.
     */
    behaviorStateChanged: function() {
        this.needsStateChanged = true;
        this.repaint();
    },

    /**
     * Called from renderer/index.js
     */
    deferredBehaviorChange: function() {
        if (this.needsShapeChanged) {
            if (this.divCanvas) {
                this.synchronizeScrollingBoundaries(); // calls computeCellsBounds and repaint (state change)
            }
        } else if (this.needsStateChanged) {
            if (this.divCanvas) {
                this.computeCellsBounds();
            }
        }

        this.needsShapeChanged = this.needsStateChanged = false;
    },

    /**
     * @memberOf Hypergrid#
     * @returns {Rectangle} My bounds.
     */
    getBounds: function() {
        return this.renderer.getBounds();
    },

    repaint: function() {
        var now = this.properties.repaintImmediately;
        var canvas = this.canvas;
        if (canvas) {
            if (now === true) {
                canvas.paintNow();
            } else {
                canvas.repaint();
            }
        }
    },

    /**
     * @memberOf Hypergrid#
     * @desc Paint immediately in this microtask.
     */
    paintNow: function() {
        this.canvas.paintNow();
    },

    /**
     * @memberOf Hypergrid#
     * @summary Set the container for a grid instance
     * @private
     */
    setContainer: function(div) {
        this.initContainer(div);
        this.initRenderer();
        // injectGridElements.call(this);
    },

    /**
     * @memberOf Hypergrid#
     * @summary Initialize container
     * @private
     */
    initContainer: function(div) {
        if (typeof div === 'string') {
            div = document.querySelector(div);
        }

        //Default Position and height to ensure DnD works
        if (!div.style.position) {
            div.style.position = null; // revert to stylesheet value
        }

        if (div.clientHeight < 1) {
            div.style.height = null; // revert to stylesheet value
        }

        injectCSS('grid');

        //prevent the default context menu for appearing
        div.oncontextmenu = function(event) {
            event.stopPropagation();
            event.preventDefault();
            return false;
        };

        div.removeAttribute('tabindex');

        div.classList.add('hypergrid-container');
        div.id = div.id || 'hypergrid' + (document.querySelectorAll('.hypergrid-container').length - 1 || '');

        this.div = div;
    },

    /**
     * @memberOf Hypergrid#
     * @summary Initialize drawing surface.
     * @private
     */
    initCanvas: function() {
        if (!this.divCanvas) {
            var divCanvas = document.createElement('div');

            setStyles(divCanvas, this.options.margin, EDGE_STYLES);

            this.div.appendChild(divCanvas);

            var canvas = new Canvas(divCanvas, this.renderer, this.options.canvas);
            canvas.canvas.classList.add('hypergrid');

            this.divCanvas = divCanvas;
            this.canvas = canvas;

            this.delegateCanvasEvents();
        }
    },

    convertViewPointToDataPoint: function(unscrolled) {
        return this.behavior.convertViewPointToDataPoint(unscrolled);
    },

    convertDataPointToViewPoint: function(dataPoint) {
        return this.behavior.convertDataPointToViewPoint(dataPoint);
    },

    /**
     * @memberOf Hypergrid#
     * @desc Switch the cursor for a grid instance.
     * @param {string} cursorName - A well know cursor name.
     * @see [cursor names](http://www.javascripter.net/faq/stylesc.htm)
     */
    beCursor: function(cursorName) {
        if (!cursorName) {
            cursorName = 'default';
        }
        this.div.style.cursor = cursorName;
    },

    /**
     * @summary Shut down the current cell editor and save the edited value.
     * @returns {boolean} One of:
     * * `false` - Editing BUT could not abort.
     * * `true` - Not editing OR was editing AND abort was successful.
     * @memberOf Hypergrid#
     */
    stopEditing: function() {
        return !this.cellEditor || this.cellEditor.stopEditing();
    },

    /**
     * @summary Shut down the current cell editor without saving the edited val
     * @returns {boolean} One of:
     * * `false` - Editing BUT could not abort.
     * * `true` - Not editing OR was editing AND abort was successful.
     * @memberOf Hypergrid#
     */
    cancelEditing: function() {
        return !this.cellEditor || this.cellEditor.cancelEditing();
    },

    /**
     * @summary Give cell editor opportunity to cancel (or something) instead of stop .
     * @returns {boolean} One of:
     * * `false` - Editing BUT could not abort.
     * * `true` - Not editing OR was editing AND abort was successful.
     * @memberOf Hypergrid#
     */
    abortEditing: function() {
        return !this.cellEditor || (
            this.cellEditor.abortEditing ? this.cellEditor.abortEditing() : this.cellEditor.stopEditing()
        );
    },

    /**
     * @memberOf Hypergrid#
     * @returns {Rectangle} The pixel coordinates of just the center 'main" data area.
     */
    getDataBounds: function() {
        var b = this.canvas.bounds;
        return new Rectangle(0, 0, b.origin.x + b.extent.x, b.origin.y + b.extent.y);
    },

    /**
     * @memberOf Hypergrid#
     * @summary Open the cell-editor for the cell at the given coordinates.
     * @param {CellEvent} event - Coordinates of "edit point" (gridCell.x, dataCell.y).
     * @return {undefined|CellEditor} The cellEditor determined from the cell's render properties, which may be modified by logic added by overriding {@link DataModel#getCellEditorAt|getCellEditorAt}.
     */
    editAt: function(event) {
        var cellEditor;

        this.abortEditing(); // if another editor is open, close it first

        if (
            event.isDataColumn &&
            event.properties[event.isDataRow ? 'editable' : 'filterable'] &&
            (cellEditor = this.getCellEditorAt(event))
        ) {
            cellEditor.beginEditing();
        }

        return cellEditor;
    },

    /**
     * @memberOf Hypergrid#
     * @param {number} columnIndex - The column index in question.
     * @returns {boolean} The given column is fully visible.
     */
    isColumnVisible: function(columnIndex) {
        return this.renderer.isColumnVisible(columnIndex);
    },

    /**
     * @memberOf Hypergrid#
     * @param {number} r - The raw row index in question.
     * @returns {boolean} The given row is fully visible.
     */
    isDataRowVisible: function(r) {
        return this.renderer.isDataRowVisible(r);
    },

    /**
     * @memberOf Hypergrid#
     * @param {number} c - The column index in question.
     * @param {number} rn - The grid row index in question.
     * @returns {boolean} The given cell is fully is visible.
     */
    isDataVisible: function(c, rn) {
        return this.isDataRowVisible(rn) && this.isColumnVisible(c);
    },

    /**
     * @memberOf Hypergrid#
     * @summary Scroll in the `offsetX` direction if column index `colIndex` is not visible.
     * @param {number} colIndex - The column index in question.
     * @param {number} offsetX - The direction and magnitude to scroll if we need to.
     * @return {boolean} Column is visible.
     */
    insureModelColIsVisible: function(colIndex, offsetX) {
        var maxCols = this.getColumnCount() - 1, // -1 excludes partially visible columns
            indexToCheck = colIndex + Math.sign(offsetX),
            visible = !this.isColumnVisible(indexToCheck) || colIndex === maxCols;

        if (visible) {
            //the scroll position is the leftmost column
            this.scrollBy(offsetX, 0);
        }

        return visible;
    },

    /**
     * @memberOf Hypergrid#
     * @summary Scroll in the `offsetY` direction if column index c is not visible.
     * @param {number} rowIndex - The column index in question.
     * @param {number} offsetX - The direction and magnitude to scroll if we need to.
     * @return {boolean} Row is visible.
     */
    insureModelRowIsVisible: function(rowIndex, offsetY) {
        var maxRows = this.getRowCount() - 1, // -1 excludes partially visible rows
            scrollOffset = (offsetY > -1) ? 2 : 0, // 2 to keep one blank line below active cell, 0 to keep zero lines above active cell
            indexToCheck = rowIndex + scrollOffset,
            visible = !this.isDataRowVisible(indexToCheck) || rowIndex === maxRows;

        if (visible) {
            //the scroll position is the topmost row
            this.scrollBy(0, offsetY);
        }

        return visible;
    },

    /**
     * @memberOf Hypergrid#
     * @summary Scroll horizontal and vertically by the provided offsets.
     * @param {number} offsetX - Scroll in the x direction this much.
     * @param {number} offsetY - Scroll in the y direction this much.
     */
    scrollBy: function(offsetX, offsetY) {
        this.scrollHBy(offsetX);
        this.scrollVBy(offsetY);
    },

    /**
     * @memberOf Hypergrid#
     * @summary Scroll vertically by the provided offset.
     * @param {number} offsetY - Scroll in the y direction this much.
     */
    scrollVBy: function(offsetY) {
        var max = this.sbVScroller.range.max;
        var oldValue = this.getVScrollValue();
        var newValue = Math.min(max, Math.max(0, oldValue + offsetY));
        if (newValue !== oldValue) {
            this.setVScrollValue(newValue);
        }
    },

    /**
     * @memberOf Hypergrid#
     * @summary Scroll horizontally by the provided offset.
     * @param {number} offsetX - Scroll in the x direction this much.
     */
    scrollHBy: function(offsetX) {
        var max = this.sbHScroller.range.max;
        var oldValue = this.getHScrollValue();
        var newValue = Math.min(max, Math.max(0, oldValue + offsetX));
        if (newValue !== oldValue) {
            this.setHScrollValue(newValue);
        }
    },

    scrollToMakeVisible: function(c, r) {
        var delta,
            dw = this.renderer.dataWindow,
            fixedColumnCount = this.properties.fixedColumnCount,
            fixedRowCount = this.properties.fixedRowCount;

        // scroll only if target not in fixed columns
        if (c >= fixedColumnCount) {
            // target is to left of scrollable columns; negative delta scrolls left
            if ((delta = c - dw.origin.x) < 0) {
                this.sbHScroller.index += delta;

                // target is to right of scrollable columns; positive delta scrolls right
                // Note: The +1 forces right-most column to scroll left (just in case it was only partially in view)
            } else if ((c - dw.corner.x + 1) > 0) {
                this.sbHScroller.index = this.renderer.getMinimumLeftPositionToShowColumn(c);
            }
        }

        if (
            r >= fixedRowCount && // scroll only if target not in fixed rows
            (
                // target is above scrollable rows; negative delta scrolls up
                (delta = r - dw.origin.y) < 0 ||

                // target is below scrollable rows; positive delta scrolls down
                (delta = r - dw.corner.y) > 0
            )
        ) {
            this.sbVScroller.index += delta;
        }
    },

    selectCellAndScrollToMakeVisible: function(c, r) {
        this.scrollToMakeVisible(c, r);
        this.selectCell(c, r, true);
    },

    /**
     * @memberOf Hypergrid#
     * @summary Answer which data cell is under a pixel value mouse point.
     * @param {mousePoint} mouse - The mouse point to interrogate.
     */

    getGridCellFromMousePoint: function(mouse) {
        return this.renderer.getGridCellFromMousePoint(mouse);
    },

    /**
     * @param {Point} gridCell - The pixel location of the mouse in physical grid coordinates.
     * @returns {Rectangle} The pixel based bounds rectangle given a data cell point.
     * @memberOf Hypergrid#
     */
    getBoundsOfCell: function(gridCell) {
        var b = this.renderer.getBoundsOfCell(gridCell.x, gridCell.y);

        //convert to a proper rectangle
        return new Rectangle(b.x, b.y, b.width, b.height);
    },

    /**
     * @memberOf Hypergrid#
     * @desc This is called by the fin-canvas when a resize occurs.
     */
    resized: function() {
        this.behaviorShapeChanged();
    },

    /**
     * @memberOf Hypergrid#
     * @summary A click event occurred.
     * @desc Determine the cell and delegate to the behavior (model).
     * @param {MouseEvent} event - The mouse event to interrogate.
     * @returns {boolean|undefined} Changed. Specifically, one of:
     * * `undefined` row had no drill-down control
     * * `true` drill-down changed
     * * `false` drill-down unchanged (was already in requested state)
     */
    cellClicked: function(event) {
        var result = this.behavior.cellClicked(event);

        if (result !== undefined) {
            this.behavior.changed();
        }

        return result;
    },

    /**
     * To intercept link clicks, override this method (either on the prototype to apply to all grid instances or on an instance to apply to a specific grid instance).
     * @memberOf Hypergrid#
     */
    windowOpen: function(url, name, features, replace) {
        return window.open.apply(window, arguments);
    },

    /**
     * @param {number} [begin]
     * @param {nubmer} [end]
     * * @returns {Column[]} A copy of the all columns array by passing the params to `Array.prototype.slice`.
     */
    getColumns: function(begin, end) {
        var columns = this.behavior.getColumns();
        return columns.slice.apply(columns, arguments);
    },

    /**
     * @param {number} [begin]
     * @param {nubmer} [end]
     * * @returns {Column[]} A copy of the active columns array by passing the params to `Array.prototype.slice`.
     */
    getActiveColumns: function(begin, end) {
        var columns = this.behavior.getActiveColumns();
        return columns.slice.apply(columns, arguments);
    },

    getHiddenColumns: function() {
        //A non in-memory behavior will be more troublesome
        return this.behavior.getHiddenColumns();
    },

    isViewableButton: function(c, r) {
        return this.renderer.isViewableButton(c, r);
    },

    /**
     * @memberOf Hypergrid#
     * @desc Request input focus.
     */
    takeFocus: function() {
        var wasCellEditor = this.cellEditor;
        this.stopEditing();
        if (!wasCellEditor) {
            this.canvas.takeFocus();
        }
    },

    /**
     * @memberOf Hypergrid#
     * @desc Request focus for our cell editor.
     */
    editorTakeFocus: function() {
        if (this.cellEditor) {
            return this.cellEditor.takeFocus();
        }
    },

    /**
     * @memberOf Hypergrid#
     * @desc Initialize the scroll bars.
     */
    initScrollbars: function() {
        if (this.sbHScroller && this.sbVScroller) {
            return;
        }

        var Scrollbar = Hypergrid.modules.scrollbar;

        var horzBar = new Scrollbar({
            orientation: 'horizontal',
            onchange: this.setHScrollValue.bind(this),
            cssStylesheetReferenceElement: this.div
        });

        var vertBar = new Scrollbar({
            orientation: 'vertical',
            onchange: this.setVScrollValue.bind(this),
            paging: {
                up: this.pageUp.bind(this),
                down: this.pageDown.bind(this)
            }
        });

        this.sbHScroller = horzBar;
        this.sbVScroller = vertBar;

        var hPrefix = this.properties.hScrollbarClassPrefix;
        var vPrefix = this.properties.vScrollbarClassPrefix;

        if (hPrefix && hPrefix !== '') {
            this.sbHScroller.classPrefix = hPrefix;
        }

        if (vPrefix && vPrefix !== '') {
            this.sbVScroller.classPrefix = vPrefix;
        }

        this.div.appendChild(horzBar.bar);
        this.div.appendChild(vertBar.bar);

        this.resizeScrollbars();
    },

    resizeScrollbars: function() {
        this.sbHScroller.shortenBy(this.sbVScroller).resize();
        //this.sbVScroller.shortenBy(this.sbHScroller);
        this.sbVScroller.resize();
    },

    /**
     * @memberOf Hypergrid#
     * @desc Scroll values have changed, we've been notified.
     */
    setVScrollbarValues: function(max) {
        this.sbVScroller.range = {
            min: 0,
            max: max
        };
    },

    setHScrollbarValues: function(max) {
        this.sbHScroller.range = {
            min: 0,
            max: max
        };
    },

    scrollValueChangedNotification: function() {
        if (
            this.hScrollValue !== this.sbPrevHScrollValue ||
            this.vScrollValue !== this.sbPrevVScrollValue
        ) {
            this.sbPrevHScrollValue = this.hScrollValue;
            this.sbPrevVScrollValue = this.vScrollValue;

            if (this.cellEditor) {
                this.cellEditor.scrollValueChangedNotification();
            }

            this.computeCellsBounds();
        }
    },

    /**
     * @memberOf Hypergrid#
     * @summary Get data value at given cell.
     * @param {number} x - The horizontal coordinate.
     * @param {number} y - The vertical coordinate.
     */
    getValue: function(x, y) {
        return this.behavior.getValue.apply(this.behavior, arguments); // must use .apply (see this.behavior.getValue)
    },

    /**
     * @memberOf Hypergrid#
     * @summary Set a data value of a given cell.
     * @param {number} x - The horizontal coordinate.
     * @param {number} y - The vertical coordinate.
     * @param {*} value - New cell value.
     */
    setValue: function(x, y, value) {
        this.behavior.setValue.apply(this.behavior, arguments); // must use .apply (see this.behavior.setValue)
    },

    /**
     * @memberOf Hypergrid#
     * @desc Note that "viewable rows" includes any partially viewable rows.
     * @returns {number} The number of viewable rows.
     */
    getVisibleRows: function() {
        return this.renderer.getVisibleRows();
    },

    /**
     * @memberOf Hypergrid#
     * @desc Note that "viewable columns" includes any partially viewable columns.
     * @returns {number} The number of viewable columns.
     */
    getVisibleColumns: function() {
        return this.renderer.getVisibleColumns();
    },

    /**
     * @memberOf Hypergrid#
     * @summary Initialize the renderer sub-component.
     */
    initRenderer: function() {
        this.renderer = this.renderer || new Renderer(this);
    },

    /**
     * @memberOf Hypergrid#
     * @returns {number} The width of the given column.
     * @param {number} columnIndex - The untranslated column index.
     */
    getColumnWidth: function(columnIndex) {
        return this.behavior.getColumnWidth(columnIndex);
    },

    /**
     * @memberOf Hypergrid#
     * @desc Set the width of the given column.
     * @param {number} columnIndex - The untranslated column index.
     * @param {number} columnWidth - The width in pixels.
     */
    setColumnWidth: function(columnIndex, columnWidth) {
        if (this.abortEditing()) {
            this.behavior.setColumnWidth(columnIndex, columnWidth);
        }
    },

    getColumnEdge: function(c) {
        return this.behavior.getColumnEdge(c, this.getRenderer());
    },

    /**
     * @memberOf Hypergrid#
     * @returns {number} The total width of all the fixed columns.
     */
    getFixedColumnsWidth: function() {
        return this.behavior.getFixedColumnsWidth();
    },

    /**
     * @memberOf Hypergrid#
     * @returns {number} The height of the given row
     * @param {number} rowIndex - The untranslated fixed column index.
     */
    getRowHeight: function(rowIndex, dataModel) {
        return this.behavior.getRowHeight(rowIndex, dataModel);
    },

    /**
     * @memberOf Hypergrid#
     * @desc Set the height of the given row.
     * @param {number} rowIndex - The row index.
     * @param {number} rowHeight - The width in pixels.
     */
    setRowHeight: function(rowIndex, rowHeight, dataModel) {
        if (this.abortEditing()) {
            this.behavior.setRowHeight(rowIndex, rowHeight, dataModel);
        }
    },

    /**
     * @memberOf Hypergrid#
     * @returns {number} The total fixed rows height
     */
    getFixedRowsHeight: function() {
        return this.behavior.getFixedRowsHeight();
    },

    /**
     * Number of _visible_ columns.
     * @memberOf Hypergrid#
     * @returns {number} The number of columns.
     */
    getColumnCount: function() {
        return this.behavior.getActiveColumnCount();
    },

    /**
     * @memberOf Hypergrid#
     * @returns {number} The number of rows.
     */
    getRowCount: function() {
        return this.behavior.getRowCount();
    },

    /**
     * @memberOf Hypergrid#
     * @returns {number} The number of fixed columns.
     */
    getFixedColumnCount: function() {
        return this.behavior.getFixedColumnCount();
    },

    /**
     * @memberOf Hypergrid#
     * @returns The number of fixed rows.
     */
    getFixedRowCount: function() {
        return this.behavior.getFixedRowCount();
    },

    /**
     * @memberOf Hypergrid#
     * @summary The top left area has been clicked on
     * @desc Delegates to the behavior.
     * @param {event} mouse - The event details.
     */
    topLeftClicked: function(mouse) {
        this.behavior.topLeftClicked(this, mouse);
    },

    /**
     * @memberOf Hypergrid#
     * @summary A fixed row has been clicked.
     * @desc Delegates to the behavior.
     * @param {event} event - The event details.
     */
    rowHeaderClicked: function(mouse) {
        this.behavior.rowHeaderClicked(this, mouse);
    },

    /**
     * @memberOf Hypergrid#
     * @summary A fixed column has been clicked.
     * @desc Delegates to the behavior.
     * @param {event} event - The event details.
     */
    columnHeaderClicked: function(mouse) {
        this.behavior.columnHeaderClicked(this, mouse);
    },

    /**
     * @memberOf Hypergrid#
     * @desc An edit event has occurred. Activate the editor at the given coordinates.
     * @param {number} event.gridCell.x - The horizontal coordinate.
     * @param {number} event.gridCell.y - The vertical coordinate.
     * @param {boolean} [event.primitiveEvent.type]
     * @returns {undefined|CellEditor} The editor object or `undefined` if no editor or editor already open.
     */
    onEditorActivate: function(event) {
        return this.editAt(event);
    },

    /**
     * @memberOf Hypergrid#
     * @summary Get the cell editor.
     * @desc Delegates to the behavior.
     * @returns The cell editor at the given coordinates.
     * @param {Point} cellEvent - The grid cell coordinates.
     */
    getCellEditorAt: function(event) {
        return this.behavior.getCellEditorAt(event);
    },

    /**
     * @memberOf Hypergrid#
     * @summary Toggle HiDPI support.
     * @desc HiDPI support is now *on* by default.
     * > There used to be a bug in Chrome that caused severe slow down on bit blit of large images, so this HiDPI needed to be optional.
     */
    toggleHiDPI: function() {
        if (this.properties.useHiDPI) {
            this.removeAttribute('hidpi');
        } else {
            this.setAttribute('hidpi', null);
        }
        this.canvas.resize();
    },

    /**
     * @memberOf Hypergrid#
     * @returns {number} The HiDPI ratio.
     */
    getHiDPI: function(ctx) {
        if (window.devicePixelRatio && this.properties.useHiDPI) {
            var devicePixelRatio = window.devicePixelRatio || 1,
                backingStoreRatio = ctx.webkitBackingStorePixelRatio ||
                    ctx.mozBackingStorePixelRatio ||
                    ctx.msBackingStorePixelRatio ||
                    ctx.oBackingStorePixelRatio ||
                    ctx.backingStorePixelRatio || 1,
                result = devicePixelRatio / backingStoreRatio;
        } else {
            result = 1;
        }
        return result;
    },

    /**
     * @memberOf Hypergrid#
     * @returns {number} The width of the given (recently rendered) column.
     * @param {number} colIndex - The column index.
     */
    getRenderedWidth: function(colIndex) {
        return this.renderer.getRenderedWidth(colIndex);
    },

    /**
     * @memberOf Hypergrid#
     * @returns {number} The height of the given (recently rendered) row.
     * @param {number} rowIndex - The row index.
     */
    getRenderedHeight: function(rowIndex) {
        return this.renderer.getRenderedHeight(rowIndex);
    },

    /**
     * @memberOf Hypergrid#
     * @desc Update the cursor under the hover cell.
     */
    updateCursor: function() {
        var cursor = this.behavior.getCursorAt(-1, -1);
        var hoverCell = this.hoverCell;
        if (
            hoverCell &&
            hoverCell.x > -1 &&
            hoverCell.y > -1
        ) {
            var x = hoverCell.x + this.getHScrollValue();
            cursor = this.behavior.getCursorAt(x, hoverCell.y + this.getVScrollValue());
        }
        this.beCursor(cursor);
    },

    /**
     * @memberOf Hypergrid#
     * @desc Repaint the given cell.
     * @param {x} x - The horizontal coordinate.
     * @param {y} y - The vertical coordinate.
     */
    repaintCell: function(x, y) {
        this.renderer.repaintCell(x, y);
    },

    /**
     * @memberOf Hypergrid#
     * @returns {boolean} The user is currently dragging a column to reorder it.
     */
    isDraggingColumn: function() {
        return !!this.renderOverridesCache.dragger;
    },

    /**
     * @memberOf Hypergrid#
     * @returns {object[]} Objects with the values that were just rendered.
     */
    getRenderedData: function() {
        // assumes one row of headers
        var behavior = this.behavior,
            colCount = this.getColumnCount().length,
            rowCount = this.renderer.visibleRows.length,
            headers = new Array(colCount),
            results = new Array(rowCount),
            row;

        headers.forEach(function(header, c) {
            headers[c] = behavior.getActiveColumn(c).header;
        });

        results.forEach(function(result, r) {
            row = results[r] = {
                hierarchy: behavior.getFixedColumnValue(0, r)
            };
            headers.forEach(function(field, c) {
                row[field] = behavior.getValue(c, r);
            });
        });

        return results;
    },

    /**
     * @summary Autosize a column for best fit.
     * @param {Column|number} columnOrIndex - The column or active column index.
     * @memberOf Hypergrid#
     */
    autosizeColumn: function(columnOrIndex) {
        var column = columnOrIndex >= -2 ? this.behavior.getActiveColumn(columnOrIndex) : columnOrIndex;
        column.checkColumnAutosizing(true);
        this.computeCellsBounds();
    },

    /**
     * @memberOf Hypergrid#
     * @desc Enable/disable if this component can receive the focus.
     * @param {boolean} - canReceiveFocus
     */
    setFocusable: function(canReceiveFocus) {
        this.canvas.setFocusable(canReceiveFocus);
    },

    /**
     * @memberOf Hypergrid#
     * @returns {number} The number of columns that were just rendered
     */
    getVisibleColumnsCount: function() {
        return this.renderer.getVisibleColumnsCount();
    },

    /**
     * @memberOf Hypergrid#
     * @returns {number} The number of rows that were just rendered
     */
    getVisibleRowsCount: function() {
        return this.renderer.getVisibleRowsCount();
    },

    /**
     * @memberOf Hypergrid#
     * @desc Update the size of a grid instance.
     */
    updateSize: function() {
        this.canvas.checksize();
    },


    /**
     * @memberOf Hypergrid#
     * @desc Stop the global repainting flag thread.
     */
    stopPaintThread: function() {
        this.canvas.stopPaintThread();
    },

    /**
     * @memberOf Hypergrid#
     * @desc Stop the global resize check flag thread.
     */
    stopResizeThread: function() {
        this.canvas.stopResizeThread();
    },

    /**
     * @memberOf Hypergrid#
     * @desc Restart the global resize check flag thread.
     */
    restartResizeThread: function() {
        this.canvas.restartResizeThread();
    },

    /**
     * @memberOf Hypergrid#
     * @desc Restart the global repainting check flag thread.
     */
    restartPaintThread: function() {
        this.canvas.restartPaintThread();
    },

    swapColumns: function(source, target) {
        //Turns out this is called during dragged 'i.e' when the floater column is reshuffled
        //by the currently dragged column. The column positions are constantly reshuffled
        this.behavior.swapColumns(source, target);
    },

    endDragColumnNotification: function() {
        this.behavior.endDragColumnNotification();
    },

    getFixedColumnsMaxWidth: function() {
        return this.behavior.getFixedColumnsMaxWidth();
    },

    isMouseDownInHeaderArea: function() {
        var headerRowCount = this.getHeaderRowCount();
        var mouseDown = this.getMouseDown();
        return mouseDown.x < 0 || mouseDown.y < headerRowCount;
    },

    /**
     * @param {index} x - Data x coordinate.
     * @return {Object} The properties for a specific column.
     * @memberOf Hypergrid#
     */
    getColumnProperties: function(x) {
        return this.behavior.getColumnProperties(x);
    },

    /**
     * @param {index} x - Data x coordinate.
     * @return {Object} The properties for a specific column.
     * @memberOf Hypergrid#
     */
    setColumnProperties: function(x, properties) {
        this.behavior.setColumnProperties(x, properties);
    },

    /**
     * Clears all cell properties of given column or of all columns.
     * @param {number} [x] - Omit for all columns.
     * @memberOf Behavior#
     */
    clearAllCellProperties: function(x) {
        this.behavior.clearAllCellProperties(x);
        this.renderer.resetAllCellPropertiesCaches();
    },

    /**
     * @param {integerRowIndex|sectionPoint} rn
     * @returns {boolean}
     * @memberOf Hypergrid#
     */
    isGridRow: function(y) {
        return new this.behavior.CellEvent(0, y).isDataRow;
    },

    /**
     * @returns {number} The total number of rows of all subgrids preceding the data subgrid.
     * @memberOf Hypergrid#
     */
    getHeaderRowCount: function() {
        return this.behavior.getHeaderRowCount();
    },

    hasTreeColumn: function() {
        return this.behavior.hasTreeColumn();
    },
    lookupFeature: function(key) {
        return this.behavior.lookupFeature(key);
    },
    getRow: function(y) {
        return this.behavior.getRow(y);
    },

    newPoint: function(x, y) {
        return new Point(x, y);
    },
    newRectangle: function(x, y, width, height) {
        return new Rectangle(x, y, width, height);
    },

    get charMap() {
        return this.behavior.charMap;
    }
});

/**
 * Creates an instance variable backer for use by the getters and setters described in {@link dynamicPropertyDescriptors}.
 * @constructor
 * @memberOf Hypergrid~
 * @private
 */
function Var() {
    var BACKING_STORE = '.var.';
    Object.getOwnPropertyNames(dynamicPropertyDescriptors).forEach(function(name) {
        var descriptor = dynamicPropertyDescriptors[name];
        if (
            methodContains(descriptor.get, BACKING_STORE) ||
            methodContains(descriptor.set, BACKING_STORE)
        ) {
            this[name] = defaults[name];
        }
    }, this);
}

function methodContains(method, sarg) {
    return method && method.toString().indexOf(sarg) !== -1;
}

function findOrCreateContainer(boundingRect) {
    var div = document.getElementById('hypergrid'),
        used = div && !div.firstElementChild;

    if (!used) {
        div = document.createElement('div');
        setStyles(div, boundingRect, RECT_STYLES);
        document.body.appendChild(div);
    }

    return div;
}

function setStyles(el, style, keys) {
    if (style) {
        var elStyle = el.style;
        keys.forEach(function(key) {
            if (style[key] !== undefined) {
                elStyle[key] = style[key];
            }
        });
    }
}

function stringifyFunctions() {
    var self = this;
    return Object.keys(this).reduce(function(obj, key) {
        if (key !== 'toJSON') {
            obj[key] = /^function /.test(key)
                ? null // anon func: no point in saving because key itself is already the stringified function
                : self[key].toString() // stringify the function
                    .replace(/^function anonymous\(/, 'function(') // clean up Chromium artifact
                    .replace('\n/*``*/)', ')'); // clean up Chromium artifact
        }
        return obj;
    }, {});
}

function clone(value) {
    if (Array.isArray(value)) {
        return value.slice(); // clone array
    } else if (typeof value === 'object') {
        return Object.defineProperties({}, Object.getOwnPropertyDescriptors(value));
    } else {
        return value;
    }
}

function deepClone(object) {
    var result = clone(object);
    Object.keys(result).forEach(function(key) {
        var descriptor = Object.getOwnPropertyDescriptor(result, key);
        if (typeof descriptor.value === 'object') {
            result[key] = deepClone(descriptor.value);
        }
    });
    return result;
}

/**
 * @name plugins
 * @memberOf Hypergrid
 * @type {object}
 * @summary Hash of references to shared plug-ins.
 * @desc Dictionary of shared (pre-installed) plug-ins. Used internally, primarily to avoid reinstallations. See examples for how to reference (albeit there is normally no need to reference plugins directly).
 *
 * For the dictionary of _instance_ plugins, see {@link Hypergrid#plugins|plugins} (defined in the {@link Hypergrid#intialize|Hypergrid constructor}).
 *
 * To force reinstallation of a shared plugin delete it first:
 * ```javascript
 * delete Hypergrid.plugins.mySharedPlugin;
 * ```
 * To force reinstallation of all shared plugins:
 * ```javascript
 * Hypergrid.plugins = {};
 * ```
 * @example
 * var allSharedPlugins = Hypergrid.plugins;
 * var mySharedPlugin = Hypergrid.plugins.mySharedPlugin;
 */
Hypergrid.plugins = {};

/**
 * @name localization
 * @memberOf Hypergrid
 * @type {object}
 * @summary Shared localization defaults for all grid instances.
 * @desc These property values are overridden by those supplied in the `Hypergrid` constructor's `options.localization`.
 * @property {string|string[]} [locale] - The default locale to use when an explicit `locale` is omitted from localizer constructor calls. Passed to Intl.NumberFormat` and `Intl.DateFormat`. See {@ https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Intl#Locale_identification_and_negotiation|Locale identification and negotiation} for more information. Omitting will use the runtime's local language and region.
 * @property {object} [numberOptions] - Options passed to `Intl.NumberFormat` for creating the basic "number" localizer.
 * @property {object} [dateOptions] - Options passed to `Intl.DateFormat` for creating the basic "date" localizer.
 */
Hypergrid.localization = {
    locale: 'en-US',
    numberOptions: { maximumFractionDigits: 0 }
};


// mix in the mixins

Hypergrid.mixIn = Hypergrid.prototype.mixIn;

Hypergrid.prototype.mixIn(require('./events').mixin);
Hypergrid.prototype.mixIn(require('./selection').mixin);
Hypergrid.prototype.mixIn(require('./scrolling').mixin);

Hypergrid.prototype.mixIn(themes.mixin);
Hypergrid.mixIn(themes.sharedMixin);


// deprecated module access

function pleaseUse(requireString, module) {
    if (!pleaseUse.warned[requireString]) {
        var key = requireString.match(/\w+$/)[0];
        console.warn('Reference to ' + key + ' external module using' +
            ' `Hypergrid.' + key + '.` has been deprecated as of v3.0.0 in favor of' +
            ' `require(\'' + requireString + '\')` from within a Hypergrid Client Module' +
            ' (otherwise use `Hypergrid.require(...)`) and will be removed in a future release.' +
            ' See https://github.com/fin-hypergrid/core/wiki/Client-Modules#internal-modules.');
        pleaseUse.warned[requireString] = true;
    }
    return module;
}
pleaseUse.warned = {};

Object.defineProperties(Hypergrid, {
    Base: { get: function() { return pleaseUse('fin-hypergrid/src/Base', require('../Base')); } },
    images: { get: function() { return pleaseUse('fin-hypergrid/images', require('../../images')); } }
});


/** @name defaults
 * @memberOf Hypergrid
 * @type {object}
 * @summary The `defaults` layer of the Hypergrid properties hierarchy.
 * @desc Default values for all Hypergrid properties, including grid-level properties and column property defaults.
 *
 * Synonym: `properties`
 * Properties are divided broadly into two categories:
 * * Style (a.k.a. "lnf" for "look'n'feel") properties
 * * All other properties.
 */
Hypergrid.defaults = Hypergrid.properties = defaults;


// Define modules namespace and install overridable external modules.
// Hypergrid core code references them via this object — rather than require() — where used.
// Note that `modules` also supports the Hypergrid Module Loader (included only with the build file).
Hypergrid.modules = require('./modules');


module.exports = Hypergrid;

},{"../../css/index":9,"../../images":11,"../Base":25,"../behaviors/Behavior":32,"../behaviors/JSON":34,"../cellEditors":46,"../cellRenderers":56,"../defaults":62,"../lib/Canvas":77,"../lib/Localization":79,"../lib/SelectionModel":81,"../lib/dynamicProperties":85,"../lib/polyfills":88,"../renderer/index":97,"./events":26,"./modules":28,"./scrolling":29,"./selection":30,"./themes":31,"inject-stylesheet-template":17,"object-iterators":19,"rectangular":22}],28:[function(require,module,exports){
'use strict';

/*
 * This module is the namespace of loaded external modules known to `Hypergrid.require`,
 * which may include loaded application modules, datasource modules, and plug-in modules.
 *
 * The pre-loaded external modules listed below can conveniently be overridden by the
 * application developer by loading a new module using the same key.
 *
 * For example, to override `finbars` with another compatible module (that conforms to the
 * same interface), just assign it like so: `Hypergrid.modules.Scrollbar = myFinbarReplacement;`
 */

module.exports = {
    Scrollbar: require('finbars'),
    events: require('pubsubstar').mixin
};

},{"finbars":16,"pubsubstar":21}],29:[function(require,module,exports){
'use strict';

var Scrollbar = require('./modules').Scrollbar;

/**
 * Additions to `Hypergrid.prototype` for scrollbar support.
 * @mixin
 */
exports.mixin = {

    /**
     * A float value between 0.0 - 1.0 of the vertical scroll position.
     * @type {number}
     * @memberOf Hypergrid#
     */
    vScrollValue: 0,

    /**
     * A float value between 0.0 - 1.0 of the horizontal scroll position.
     * @type {number}
     * @memberOf Hypergrid#
     */
    hScrollValue: 0,

    /**
     * @property {fin-vampire-bar} sbVScroller - An instance of {@link https://github.com/openfin/finbars|FinBar}.
     * @memberOf Hypergrid#
     */
    sbVScroller: null,

    /**
     * The previous value of sbVScrollVal.
     * @type {number}
     * @memberOf Hypergrid#
     */
    sbPrevVScrollValue: null,

    /**
     * The previous value of sbHScrollValue.
     * @type {number}
     * @memberOf Hypergrid#
     */
    sbPrevHScrollValue: null,

    scrollingNow: false,

    /**
     * @memberOf Hypergrid#
     * @summary Set for `scrollingNow` field.
     * @param {boolean} isItNow - The type of event we are interested in.
     */
    setScrollingNow: function(isItNow) {
        this.scrollingNow = isItNow;
    },

    /**
     * @memberOf Hypergrid#
     * @returns {boolean} The `scrollingNow` field.
     */
    isScrollingNow: function() {
        return this.scrollingNow;
    },

    /**
     * @memberOf Hypergrid#
     * @summary Scroll horizontal and vertically by the provided offsets.
     * @param {number} offsetX - Scroll in the x direction this much.
     * @param {number} offsetY - Scroll in the y direction this much.
     */
    scrollBy: function(offsetX, offsetY) {
        this.scrollHBy(offsetX);
        this.scrollVBy(offsetY);
    },

    /**
     * @memberOf Hypergrid#
     * @summary Scroll vertically by the provided offset.
     * @param {number} offsetY - Scroll in the y direction this much.
     */
    scrollVBy: function(offsetY) {
        var max = this.sbVScroller.range.max;
        var oldValue = this.getVScrollValue();
        var newValue = Math.min(max, Math.max(0, oldValue + offsetY));
        if (newValue !== oldValue) {
            this.setVScrollValue(newValue);
        }
    },

    /**
     * @memberOf Hypergrid#
     * @summary Scroll horizontally by the provided offset.
     * @param {number} offsetX - Scroll in the x direction this much.
     */
    scrollHBy: function(offsetX) {
        var max = this.sbHScroller.range.max;
        var oldValue = this.getHScrollValue();
        var newValue = Math.min(max, Math.max(0, oldValue + offsetX));
        if (newValue !== oldValue) {
            this.setHScrollValue(newValue);
        }
    },

    scrollToMakeVisible: function(c, r) {
        var delta,
            dw = this.renderer.dataWindow,
            fixedColumnCount = this.properties.fixedColumnCount,
            fixedRowCount = this.properties.fixedRowCount;

        // scroll only if target not in fixed columns
        if (c >= fixedColumnCount) {
            // target is to left of scrollable columns; negative delta scrolls left
            if ((delta = c - dw.origin.x) < 0) {
                this.sbHScroller.index += delta;

                // target is to right of scrollable columns; positive delta scrolls right
                // Note: The +1 forces right-most column to scroll left (just in case it was only partially in view)
            } else if ((c - dw.corner.x + 1) > 0) {
                this.sbHScroller.index = this.renderer.getMinimumLeftPositionToShowColumn(c);
            }
        }

        if (
            r >= fixedRowCount && // scroll only if target not in fixed rows
            (
                // target is above scrollable rows; negative delta scrolls up
                (delta = r - dw.origin.y) < 0 ||

                // target is below scrollable rows; positive delta scrolls down
                (delta = r - dw.corner.y) > 0
            )
        ) {
            this.sbVScroller.index += delta;
        }
    },

    selectCellAndScrollToMakeVisible: function(c, r) {
        this.scrollToMakeVisible(c, r);
        this.selectCell(c, r, true);
    },

    /**
     * @memberOf Hypergrid#
     * @desc Set the vertical scroll value.
     * @param {number} newValue - The new scroll value.
     */
    setVScrollValue: function(y) {
        var self = this;
        y = Math.min(this.sbVScroller.range.max, Math.max(0, Math.round(y)));
        if (y !== this.vScrollValue) {
            this.behavior._setScrollPositionY(y);
            var oldY = this.vScrollValue;
            this.vScrollValue = y;
            this.scrollValueChangedNotification();
            setTimeout(function() {
                // self.sbVRangeAdapter.subjectChanged();
                self.fireScrollEvent('fin-scroll-y', oldY, y);
            });
        }
    },

    /**
     * @memberOf Hypergrid#
     * @return {number} The vertical scroll value.
     */
    getVScrollValue: function() {
        return this.vScrollValue;
    },

    /**
     * @memberOf Hypergrid#
     * @desc Set the horizontal scroll value.
     * @param {number} newValue - The new scroll value.
     */
    setHScrollValue: function(x) {
        var self = this;
        x = Math.min(this.sbHScroller.range.max, Math.max(0, Math.round(x)));
        if (x !== this.hScrollValue) {
            this.behavior._setScrollPositionX(x);
            var oldX = this.hScrollValue;
            this.hScrollValue = x;
            this.scrollValueChangedNotification();
            setTimeout(function() {
                //self.sbHRangeAdapter.subjectChanged();
                self.fireScrollEvent('fin-scroll-x', oldX, x);
                //self.synchronizeScrollingBoundries(); // todo: Commented off to prevent the grid from bouncing back, but there may be repurcussions...
            });
        }
    },

    /**
     * @memberOf Hypergrid#
     * @returns The vertical scroll value.
     */
    getHScrollValue: function() {
        return this.hScrollValue;
    },

    /**
     * @memberOf Hypergrid#
     * @desc Initialize the scroll bars.
     */
    initScrollbars: function() {
        if (this.sbHScroller && this.sbVScroller){
            return;
        }

        var self = this;

        var horzBar = new Scrollbar({
            orientation: 'horizontal',
            onchange: self.setHScrollValue.bind(self),
            cssStylesheetReferenceElement: this.div
        });

        var vertBar = new Scrollbar({
            orientation: 'vertical',
            onchange: self.setVScrollValue.bind(self),
            paging: {
                up: self.pageUp.bind(self),
                down: self.pageDown.bind(self)
            }
        });

        this.sbHScroller = horzBar;
        this.sbVScroller = vertBar;

        var hPrefix = this.properties.hScrollbarClassPrefix;
        var vPrefix = this.properties.vScrollbarClassPrefix;

        if (hPrefix && hPrefix !== '') {
            this.sbHScroller.classPrefix = hPrefix;
        }

        if (vPrefix && vPrefix !== '') {
            this.sbVScroller.classPrefix = vPrefix;
        }

        this.div.appendChild(horzBar.bar);
        this.div.appendChild(vertBar.bar);

        this.resizeScrollbars();
    },

    resizeScrollbars: function() {
        this.sbHScroller.shortenBy(this.sbVScroller).resize();
        //this.sbVScroller.shortenBy(this.sbHScroller);
        this.sbVScroller.resize();
    },

    /**
     * @memberOf Hypergrid#
     * @desc Scroll values have changed, we've been notified.
     */
    setVScrollbarValues: function(max) {
        this.sbVScroller.range = {
            min: 0,
            max: max
        };
    },

    setHScrollbarValues: function(max) {
        this.sbHScroller.range = {
            min: 0,
            max: max
        };
    },

    scrollValueChangedNotification: function() {
        if (
            this.hScrollValue !== this.sbPrevHScrollValue ||
            this.vScrollValue !== this.sbPrevVScrollValue
        ) {
            this.sbPrevHScrollValue = this.hScrollValue;
            this.sbPrevVScrollValue = this.vScrollValue;

            if (this.cellEditor) {
                this.cellEditor.scrollValueChangedNotification();
            }

            this.computeCellsBounds();
        }
    },

    /**
     * @memberOf Hypergrid#
     * @desc The data dimensions have changed, or our pixel boundaries have changed.
     * Adjust the scrollbar properties as necessary.
     */
    synchronizeScrollingBoundaries: function() {
        var numFixedColumns = this.getFixedColumnCount();

        var numColumns = this.getColumnCount();
        var numRows = this.getRowCount();

        var bounds = this.getBounds();
        if (!bounds) {
            return;
        }

        var scrollableWidth = bounds.width - this.behavior.getFixedColumnsMaxWidth();
        for (
            var columnsWidth = 0, lastPageColumnCount = 0;
            lastPageColumnCount < numColumns && columnsWidth < scrollableWidth;
            lastPageColumnCount++
        ) {
            columnsWidth += this.getColumnWidth(numColumns - lastPageColumnCount - 1);
        }
        if (columnsWidth > scrollableWidth) {
            lastPageColumnCount--;
        }

        var scrollableHeight = this.renderer.getVisibleScrollHeight();
        for (
            var rowsHeight = 0, lastPageRowCount = 0;
            lastPageRowCount < numRows && rowsHeight < scrollableHeight;
            lastPageRowCount++
        ) {
            rowsHeight += this.getRowHeight(numRows - lastPageRowCount - 1);
        }
        if (rowsHeight > scrollableHeight) {
            lastPageRowCount--;
        }

        // inform scroll bars
        if (this.sbHScroller) {
            var hMax = Math.max(0, numColumns - numFixedColumns - lastPageColumnCount);
            this.setHScrollbarValues(hMax);
            this.setHScrollValue(Math.min(this.getHScrollValue(), hMax));
        }
        if (this.sbVScroller) {
            var vMax = Math.max(0, numRows - this.properties.fixedRowCount - lastPageRowCount);
            this.setVScrollbarValues(vMax);
            this.setVScrollValue(Math.min(this.getVScrollValue(), vMax));
        }

        this.computeCellsBounds();

        // schedule to happen *after* the repaint
        setTimeout(this.resizeScrollbars.bind(this));
    },

    /**
     * @memberOf Hypergrid#
     * @desc Scroll up one full page.
     * @returns {number}
     */
    pageUp: function() {
        var rowNum = this.renderer.getPageUpRow();
        this.setVScrollValue(rowNum);
        return rowNum;
    },

    /**
     * @memberOf Hypergrid#
     * @desc Scroll down one full page.
     * @returns {number}
     */
    pageDown: function() {
        var rowNum = this.renderer.getPageDownRow();
        this.setVScrollValue(rowNum);
        return rowNum;
    },

    /**
     * @memberOf Hypergrid#
     * @desc Not yet implemented.
     */
    pageLeft: function() {
        throw 'page left not yet implemented';
    },

    /**
     * @memberOf Hypergrid#
     * @desc Not yet implemented.
     */
    pageRight: function() {
        throw 'page right not yet implemented';
    }
};

},{"./modules":28}],30:[function(require,module,exports){
/* eslint-env browser */

'use strict';

var Rectangle = require('rectangular').Rectangle;

exports.mixin = {
    selectionInitialize: function() {
        var grid = this;

        /** for use by fin-selection-changed, fin-row-selection-changed, fin-column-selection-changed
         * @memberOf Hypergrid#
         * @private
         */
        this.selectionDetailGetters = {
            get rows() { return grid.getSelectedRows(); },
            get columns() { return grid.getSelectedColumns(); },
            get selections() { return grid.selectionModel.getSelections(); }
        };

        /**
         * for use by fin-context-menu, fin-mouseup, fin-mousedown
         * @memberOf Hypergrid#
         * @private
         */
        this.selectionDetailGetterDescriptors = Object.getOwnPropertyDescriptors(this.selectionDetailGetters);
    },

    /**
     * @memberOf Hypergrid#
     * @returns {boolean} We have any selections.
     */
    hasSelections: function() {
        if (!this.getSelectionModel) {
            return; // were not fully initialized yet
        }
        return this.selectionModel.hasSelections();
    },

    /**
     * @memberOf Hypergrid#
     * @returns {string} Tab separated value string from the selection and our data.
     */
    getSelectionAsTSV: function() {
        var sm = this.selectionModel;
        if (sm.hasSelections()) {
            var selections = this.getSelectionMatrix();
            selections = selections[selections.length - 1];
            return this.getMatrixSelectionAsTSV(selections);
        } else if (sm.hasRowSelections()) {
            return this.getMatrixSelectionAsTSV(this.getRowSelectionMatrix());
        } else if (sm.hasColumnSelections()) {
            return this.getMatrixSelectionAsTSV(this.getColumnSelectionMatrix());
        }
    },

    getMatrixSelectionAsTSV: function(selections) {
        var result = '';

        //only use the data from the last selection
        if (selections.length) {
            var width = selections.length,
                height = selections[0].length,
                area = width * height,
                lastCol = width - 1,
                //Whitespace will only be added on non-singular rows, selections
                whiteSpaceDelimiterForRow = (height > 1 ? '\n' : '');

            //disallow if selection is too big
            if (area > 20000) {
                alert('selection size is too big to copy to the paste buffer'); // eslint-disable-line no-alert
                return '';
            }

            for (var h = 0; h < height; h++) {
                for (var w = 0; w < width; w++) {
                    result += selections[w][h] + (w < lastCol ? '\t' : whiteSpaceDelimiterForRow);
                }
            }
        }

        return result;
    },

    /**
     * @memberOf Hypergrid#
     * @desc Clear all the selections.
     */
    clearSelections: function() {
        var keepRowSelections = this.properties.checkboxOnlyRowSelections;
        this.selectionModel.clear(keepRowSelections);
        this.clearMouseDown();
    },

    /**
     * @memberOf Hypergrid#
     * @desc Clear the most recent selection.
     */
    clearMostRecentSelection: function() {
        var keepRowSelections = this.properties.checkboxOnlyRowSelections;
        this.selectionModel.clearMostRecentSelection(keepRowSelections);
    },

    /**
     * @memberOf Hypergrid#
     * @desc Clear the most recent column selection.
     */
    clearMostRecentColumnSelection: function() {
        this.selectionModel.clearMostRecentColumnSelection();
    },

    /**
     * @memberOf Hypergrid#
     * @desc Clear the most recent row selection.
     */
    clearMostRecentRowSelection: function() {
        //this.selectionModel.clearMostRecentRowSelection(); // commented off as per GRID-112
    },

    clearRowSelection: function() {
        this.selectionModel.clearRowSelection();
    },

    /**
     * @memberOf Hypergrid#
     * @summary Select given region.
     * @param {number} ox - origin x
     * @param {number} oy - origin y
     * @param {number} ex - extent x
     * @param {number} ex - extent y
     */
    select: function(ox, oy, ex, ey) {
        if (ox < 0 || oy < 0) {
            //we don't select negative area
            //also this means there is no origin mouse down for a selection rect
            return;
        }
        this.selectionModel.select(ox, oy, ex, ey);
    },

    /**
     * @memberOf Hypergrid#
     * @returns {boolean} Given point is selected.
     * @param {number} x - The horizontal coordinate.
     * @param {number} y - The vertical coordinate.
     */
    isSelected: function(x, y) {
        return this.selectionModel.isSelected(x, y);
    },

    /**
     * @memberOf Hypergrid#
     * @returns {boolean} The given column is selected anywhere in the entire table.
     * @param {number} y - The row index.
     */
    isCellSelectedInRow: function(y) {
        return this.selectionModel.isCellSelectedInRow(y);
    },

    /**
     * @memberOf Hypergrid#
     * @returns {boolean} The given row is selected anywhere in the entire table.
     * @param {number} x - The column index.
     */
    isCellSelectedInColumn: function(x) {
        return this.selectionModel.isCellSelectedInColumn(x);
    },

    /**
     * @param {boolean|number[]|string[]} [hiddenColumns=false] - See {@link Hypergrid~getColumns}.
     * @returns {{}}
     * @memberOf Hypergrid#
     */
    getRowSelection: function(hiddenColumns) {
        var column, rows,
            self = this,
            selectedRowIndexes = this.selectionModel.getSelectedRows(),
            columns = getColumns.call(this, hiddenColumns),
            result = {};

        for (var c = 0, C = columns.length; c < C; c++) {
            column = columns[c];
            rows = result[column.name] = new Array(selectedRowIndexes.length);
            selectedRowIndexes.forEach(getValue);
        }

        function getValue(selectedRowIndex, j) {
            var dataRow = self.getRow(selectedRowIndex);
            rows[j] = valOrFunc(dataRow, column);
        }

        return result;
    },

    /**
     * @param {boolean|number[]|string[]} [hiddenColumns=false] - See {@link Hypergrid~getColumns}.
     * @returns {Array}
     * @memberOf Hypergrid#
     */
    getRowSelectionMatrix: function(hiddenColumns) {
        var self = this,
            selectedRowIndexes = this.selectionModel.getSelectedRows(),
            columns = getColumns.call(this, hiddenColumns),
            result = new Array(columns.length);

        for (var c = 0, C = columns.length; c < C; c++) {
            var column = columns[c];
            result[c] = new Array(selectedRowIndexes.length);
            selectedRowIndexes.forEach(getValue);
        }

        function getValue(selectedRowIndex, r) {
            var dataRow = self.getRow(selectedRowIndex);
            result[c][r] = valOrFunc(dataRow, column);
        }

        return result;
    },

    getColumnSelectionMatrix: function() {
        var dataRow,
            self = this,
            headerRowCount = this.getHeaderRowCount(),
            selectedColumnIndexes = this.getSelectedColumns(),
            numRows = this.getRowCount(),
            result = new Array(selectedColumnIndexes.length);

        selectedColumnIndexes.forEach(function(selectedColumnIndex, c) {
            var column = self.behavior.getActiveColumn(selectedColumnIndex),
                values = result[c] = new Array(numRows);

            for (var r = headerRowCount; r < numRows; r++) {
                dataRow = self.getRow(r);
                values[r] = valOrFunc(dataRow, column);
            }
        });

        return result;
    },

    getColumnSelection: function() {
        var dataRow,
            self = this,
            headerRowCount = this.getHeaderRowCount(),
            selectedColumnIndexes = this.getSelectedColumns(),
            result = {},
            rowCount = this.getRowCount();

        selectedColumnIndexes.forEach(function(selectedColumnIndex) {
            var column = self.behavior.getActiveColumn(selectedColumnIndex),
                values = result[column.name] = new Array(rowCount);

            for (var r = headerRowCount; r < rowCount; r++) {
                dataRow = self.getRow(r);
                values[r] = valOrFunc(dataRow, column);
            }
        });

        return result;
    },

    getSelection: function() {
        var dataRow,
            self = this,
            selections = this.getSelections(),
            rects = new Array(selections.length);

        selections.forEach(getRect);

        function getRect(selectionRect, i) {
            var rect = normalizeRect(selectionRect),
                colCount = rect.extent.x + 1,
                rowCount = rect.extent.y + 1,
                columns = {};

            for (var c = 0, x = rect.origin.x; c < colCount; c++, x++) {
                var column = self.behavior.getActiveColumn(x),
                    values = columns[column.name] = new Array(rowCount);

                for (var r = 0, y = rect.origin.y; r < rowCount; r++, y++) {
                    dataRow = self.getRow(y);
                    values[r] = valOrFunc(dataRow, column);
                }
            }

            rects[i] = columns;
        }

        return rects;
    },

    getSelectionMatrix: function() {
        var dataRow,
            self = this,
            selections = this.getSelections(),
            rects = new Array(selections.length);

        selections.forEach(getRect);

        function getRect(selectionRect, i) {
            var rect = normalizeRect(selectionRect),
                colCount = rect.extent.x + 1,
                rowCount = rect.extent.y + 1,
                rows = [];

            for (var c = 0, x = rect.origin.x; c < colCount; c++, x++) {
                var values = rows[c] = new Array(rowCount),
                    column = self.behavior.getActiveColumn(x);

                for (var r = 0, y = rect.origin.y; r < rowCount; r++, y++) {
                    dataRow = self.getRow(y);
                    values[r] = valOrFunc(dataRow, column);
                }
            }

            rects[i] = rows;
        }

        return rects;
    },

    selectCell: function(x, y, silent) {
        var keepRowSelections = this.properties.checkboxOnlyRowSelections;
        this.selectionModel.clear(keepRowSelections);
        this.selectionModel.select(x, y, 0, 0, silent);
    },

    toggleSelectColumn: function(x, keys) {
        keys = keys || [];
        var model = this.selectionModel;
        var alreadySelected = model.isColumnSelected(x);
        var hasCTRL = keys.indexOf('CTRL') > -1;
        var hasSHIFT = keys.indexOf('SHIFT') > -1;
        if (!hasCTRL && !hasSHIFT) {
            model.clear();
            if (!alreadySelected) {
                model.selectColumn(x);
            }
        } else {
            if (hasCTRL) {
                if (alreadySelected) {
                    model.deselectColumn(x);
                } else {
                    model.selectColumn(x);
                }
            }
            if (hasSHIFT) {
                model.clear();
                model.selectColumn(this.lastEdgeSelection[0], x);
            }
        }
        if (!alreadySelected && !hasSHIFT) {
            this.lastEdgeSelection[0] = x;
        }
        this.repaint();
        this.fireSyntheticColumnSelectionChangedEvent();
    },

    toggleSelectRow: function(y, keys) {
        //we can select the totals rows if they exist, but not rows above that
        keys = keys || [];

        var sm = this.selectionModel;
        var alreadySelected = sm.isRowSelected(y);
        var hasSHIFT = keys.indexOf('SHIFT') >= 0;

        if (alreadySelected) {
            sm.deselectRow(y);
        } else {
            this.singleSelect();
            sm.selectRow(y);
        }

        if (hasSHIFT) {
            sm.clear();
            sm.selectRow(this.lastEdgeSelection[1], y);
        }

        if (!alreadySelected && !hasSHIFT) {
            this.lastEdgeSelection[1] = y;
        }

        this.repaint();
    },

    singleSelect: function() {
        var result = this.properties.singleRowSelectionMode;

        if (result) {
            this.selectionModel.clearRowSelection();
        }

        return result;
    },

    selectViewportCell: function(x, y) {
        var headerRowCount = this.getHeaderRowCount();
        x = this.renderer.visibleColumns[x].columnIndex;
        if (this.getRowCount() > 0) {
            y = this.renderer.visibleRows[y + headerRowCount].rowIndex;
            this.clearSelections();
            this.select(x, y, 0, 0);
            this.setMouseDown(this.newPoint(x, y));
            this.setDragExtent(this.newPoint(0, 0));
            this.repaint();
        }
    },

    selectToViewportCell: function(x, y) {
        var selections = this.getSelections();
        if (selections && selections.length) {
            var headerRowCount = this.getHeaderRowCount(),
                selection = selections[0],
                origin = selection.origin;
            x = this.renderer.visibleColumns[x].columnIndex;
            y = this.renderer.visibleRows[y + headerRowCount].rowIndex;
            this.setDragExtent(this.newPoint(x - origin.x, y - origin.y));
            this.select(origin.x, origin.y, x - origin.x, y - origin.y);
            this.repaint();
        }
    },

    selectFinalCellOfCurrentRow: function() {
        var x = this.getColumnCount() - 1,
            y = this.getSelectedRows()[0],
            headerRowCount = this.getHeaderRowCount();
        this.clearSelections();
        this.scrollBy(this.getColumnCount(), 0);
        this.select(x, y + headerRowCount, 0, 0);
        this.setMouseDown(this.newPoint(x, y + headerRowCount));
        this.setDragExtent(this.newPoint(0, 0));
        this.repaint();
    },

    selectToFinalCellOfCurrentRow: function() {
        var selections = this.getSelections();
        if (selections && selections.length) {
            var selection = selections[0],
                origin = selection.origin,
                extent = selection.extent,
                columnCount = this.getColumnCount();
            this.scrollBy(columnCount, 0);

            this.clearSelections();
            this.select(origin.x, origin.y, columnCount - origin.x - 1, extent.y);

            this.repaint();
        }
    },

    selectFirstCellOfCurrentRow: function() {
        var x = 0,
            y = this.getSelectedRows()[0],
            headerRowCount = this.getHeaderRowCount();
        this.clearSelections();
        this.setHScrollValue(0);
        this.select(x, y + headerRowCount, 0, 0);
        this.setMouseDown(this.newPoint(x, y + headerRowCount));
        this.setDragExtent(this.newPoint(0, 0));
        this.repaint();
    },

    selectToFirstCellOfCurrentRow: function() {
        var selections = this.getSelections();
        if (selections && selections.length) {
            var selection = selections[0],
                origin = selection.origin,
                extent = selection.extent;
            this.clearSelections();
            this.select(origin.x, origin.y, -origin.x, extent.y);
            this.setHScrollValue(0);
            this.repaint();
        }
    },

    selectFinalCell: function() {
        this.selectCellAndScrollToMakeVisible(this.getColumnCount() - 1, this.getRowCount() - 1);
        this.repaint();
    },

    selectToFinalCell: function() {
        var selections = this.getSelections();
        if (selections && selections.length) {
            var selection = selections[0],
                origin = selection.origin,
                columnCount = this.getColumnCount(),
                rowCount = this.getRowCount();

            this.clearSelections();
            this.select(origin.x, origin.y, columnCount - origin.x - 1, rowCount - origin.y - 1);
            this.scrollBy(columnCount, rowCount);
            this.repaint();
        }
    },

    /**
     * @memberOf Hypergrid#
     * @returns {object} An object that represents the currently selection row.
     */
    getSelectedRow: function() {
        var sels = this.selectionModel.getSelections();
        if (sels.length) {
            var behavior = this.behavior,
                colCount = this.getColumnCount(),
                topRow = sels[0].origin.y,
                row = {
                    //hierarchy: behavior.getFixedColumnValue(0, topRow)
                };

            for (var c = 0; c < colCount; c++) {
                row[behavior.getActiveColumn(c).header] = behavior.getValue(c, topRow);
            }

            return row;
        }
    },

    /**
     * @memberOf Hypergrid#
     * @desc Synthesize and dispatch a `fin-selection-changed` event.
     */
    selectionChanged: function() {
        // Project the cell selection into the rows
        this.selectRowsFromCells();

        // Project the cell selection into the columns
        this.selectColumnsFromCells();

        var selectionEvent = new CustomEvent('fin-selection-changed', {
            detail: this.selectionDetailGetters
        });
        this.canvas.dispatchEvent(selectionEvent);
    },

    isColumnOrRowSelected: function() {
        return this.selectionModel.isColumnOrRowSelected();
    },
    selectColumn: function(x1, x2) {
        this.selectionModel.selectColumn(x1, x2);
    },
    selectRow: function(y1, y2) {
        var sm = this.selectionModel;

        if (this.singleSelect()) {
            y1 = y2;
        } else {
            // multiple row selection
            y2 = y2 || y1;
        }

        sm.selectRow(Math.min(y1, y2), Math.max(y1, y2));
    },

    selectRowsFromCells: function() {
        if (!this.properties.checkboxOnlyRowSelections && this.properties.autoSelectRows) {
            var last;

            if (!this.properties.singleRowSelectionMode) {
                this.selectionModel.selectRowsFromCells(0, true);
            } else if ((last = this.selectionModel.getLastSelection())) {
                this.selectRow(null, last.corner.y);
            } else {
                this.clearRowSelection();
            }
            this.fireSyntheticRowSelectionChangedEvent();
        }
    },
    selectColumnsFromCells: function() {
        if (this.properties.autoSelectColumns) {
            this.selectionModel.selectColumnsFromCells();
        }
    },
    getSelectedRows: function() {
        return this.behavior.getSelectedRows();
    },
    getSelectedColumns: function() {
        return this.behavior.getSelectedColumns();
    },
    getSelections: function() {
        return this.behavior.getSelections();
    },
    getLastSelectionType: function() {
        return this.selectionModel.getLastSelectionType();
    },
    isInCurrentSelectionRectangle: function(x, y) {
        return this.selectionModel.isInCurrentSelectionRectangle(x, y);
    },
    selectAllRows: function() {
        this.selectionModel.selectAllRows();
    },
    areAllRowsSelected: function() {
        return this.selectionModel.areAllRowsSelected();
    },
    toggleSelectAllRows: function() {
        if (this.areAllRowsSelected()) {
            this.selectionModel.clear();
        } else {
            this.selectAllRows();
        }
        this.repaint();
    },

    /**
     * @summary Move cell selection by offset.
     * @desc Replace the most recent selection with a single cell selection that is moved (offsetX,offsetY) from the previous selection extent.
     * @param {number} offsetX - x offset
     * @param {number} offsetY - y offset
     * @memberOf Hypergrid#
     */
    moveSingleSelect: function(offsetX, offsetY) {
        var mouseCorner = this.getMouseDown().plus(this.getDragExtent());
        this.moveToSingleSelect(
            mouseCorner.x + offsetX,
            mouseCorner.y + offsetY
        );
    },

    /**
     * @summary Move cell selection by offset.
     * @desc Replace the most recent selection with a single cell selection that is moved (offsetX,offsetY) from the previous selection extent.
     * @param {number} newX - x coordinate to start at
     * @param {number} newY - y coordinate to start at
     * @memberOf Hypergrid#
     */
    moveToSingleSelect: function(newX, newY) {
        var maxColumns = this.getColumnCount() - 1,
            maxRows = this.getRowCount() - 1,

            maxViewableColumns = this.getVisibleColumnsCount() - 1,
            maxViewableRows = this.getVisibleRowsCount() - 1;

        if (!this.properties.scrollingEnabled) {
            maxColumns = Math.min(maxColumns, maxViewableColumns);
            maxRows = Math.min(maxRows, maxViewableRows);
        }

        newX = Math.min(maxColumns, Math.max(0, newX));
        newY = Math.min(maxRows, Math.max(0, newY));

        this.clearSelections();
        this.select(newX, newY, 0, 0);
        this.setMouseDown(this.newPoint(newX, newY));
        this.setDragExtent(this.newPoint(0, 0));

        this.selectCellAndScrollToMakeVisible(newX, newY);

        this.repaint();
    },

    /** @summary Extend cell selection by offset.
     * @desc Augment the most recent selection extent by (offsetX,offsetY) and scroll if necessary.
     * @param {number} offsetX - x coordinate to start at
     * @param {number} offsetY - y coordinate to start at
     * @memberOf Hypergrid#
     */
    extendSelect: function(offsetX, offsetY) {
        var maxColumns = this.getColumnCount() - 1,
            maxRows = this.getRowCount() - 1,

            maxViewableColumns = this.renderer.visibleColumns.length - 1,
            maxViewableRows = this.renderer.visibleRows.length - 1,

            origin = this.getMouseDown(),
            extent = this.getDragExtent(),

            newX = extent.x + offsetX,
            newY = extent.y + offsetY;

        if (!this.properties.scrollingEnabled) {
            maxColumns = Math.min(maxColumns, maxViewableColumns);
            maxRows = Math.min(maxRows, maxViewableRows);
        }

        newX = Math.min(maxColumns - origin.x, Math.max(-origin.x, newX));
        newY = Math.min(maxRows - origin.y, Math.max(-origin.y, newY));

        this.clearMostRecentSelection();

        this.select(origin.x, origin.y, newX, newY);
        this.setDragExtent(this.newPoint(newX, newY));

        var colScrolled = this.insureModelColIsVisible(newX + origin.x, offsetX),
            rowScrolled = this.insureModelRowIsVisible(newY + origin.y, offsetY);

        this.repaint();

        return colScrolled || rowScrolled;
    },

    /**
     * @returns {undefined|CellEvent}
     * @param {boolean} [useAllCells] - Search in all rows and columns instead of only rendered ones.
     * @memberOf Hypergrid#
     */
    getGridCellFromLastSelection: function(useAllCells) {
        var cellEvent,
            sel = this.selectionModel.getLastSelection();

        if (sel) {
            cellEvent = new this.behavior.CellEvent;
            cellEvent.resetGridXDataY(sel.origin.x, sel.origin.y, null, useAllCells);
        }

        return cellEvent;
    }
};

/**
 * @param {boolean|number[]|string[]} [hiddenColumns=false] - One of:
 * `false` - Active column list
 * `true` - All column list
 * `Array` - Active column list with listed columns prefixed as needed (when not already in the list). Each item in the array may be either:
 * * `number` - index into all column list
 * * `string` - name of a column from the all column list
 * @returns {Column[]}
 * @memberOf Hypergrid~
 */
function getColumns(hiddenColumns) {
    var columns,
        allColumns = this.behavior.getColumns(),
        activeColumns = this.behavior.getActiveColumns();

    if (Array.isArray(hiddenColumns)) {
        columns = [];
        hiddenColumns.forEach(function(index) {
            var key = typeof index === 'number' ? 'index' : 'name',
                column = allColumns.find(function(column) { return column[key] === index; });
            if (activeColumns.indexOf(column) < 0) {
                columns.push(column);
            }
        });
        columns = columns.concat(activeColumns);
    } else {
        columns = hiddenColumns ? allColumns : activeColumns;
    }

    return columns;
}

function normalizeRect(rect) {
    var o = rect.origin,
        c = rect.corner,

        ox = Math.min(o.x, c.x),
        oy = Math.min(o.y, c.y),

        cx = Math.max(o.x, c.x),
        cy = Math.max(o.y, c.y);

    return new Rectangle(ox, oy, cx - ox, cy - oy);
}

/**
 * @this {dataRowObject}
 * @param column
 * @returns {string}
 */
function valOrFunc(dataRow, column) {
    var result, calculator;
    if (dataRow) {
        result = dataRow[column.name];
        calculator = (typeof result)[0] === 'f' && result || column.calculator;
        if (calculator) {
            result = calculator(dataRow, column.name);
        }
    }
    return result || result === 0 || result === false ? result : '';
}

},{"rectangular":22}],31:[function(require,module,exports){
'use strict';

// This file creates the Hypergrid theme registry, exposed via:
// shared methods `Hypergrid.registerTheme` and `Hypergrid.applyTheme`
// and instance methods `myGrid.applyTheme`.
// The initial registry consists of a single theme ('default').
// Application developers can add additional themes to this registry.

var _ = require('object-iterators'); // fyi: installs the Array.prototype.find polyfill, as needed

var defaults = require('../defaults');
var dynamicPropertyDescriptors = require('../lib/dynamicProperties');
var HypergridError = require('../lib/error');

var styles = [
    'BackgroundColor',
    'Color',
    'Font'
];

var stylesWithHalign = styles.concat([
    'Halign'
]);

var dataCellStyles = stylesWithHalign.concat([
    'cellPadding',
    'iconPadding'
]);

var stylers = [
    { prefix: '',                                props: dataCellStyles },
    { prefix: 'foregroundSelection',             props: styles },
    { prefix: 'columnHeader',                    props: stylesWithHalign },
    { prefix: 'columnHeaderForegroundSelection', props: styles },
    { prefix: 'rowHeader',                       props: styles },
    { prefix: 'rowHeaderForegroundSelection',    props: styles }
];

// Here we create the `defaults` theme by copying over the theme props,
// which is a subset of all the props defined in defaults.js. The following
// combines the above prefixes with their styles to get theme prop names; and
// then copies those props from the defaults.js to create the `default` theme.
var defaultTheme = stylers.reduce(function(theme, styler) {
    return styler.props.reduce(function(theme, prop) {
        prop = styler.prefix + prop;
        prop = prop.replace('ForegroundSelectionBackground', 'BackgroundSelection'); // unfortunate!
        prop = prop[0].toLowerCase() + prop.substr(1);
        theme[prop] = defaults[prop];
        return theme;
    }, theme);
}, {
    themeName: defaults.themeName
});

/**
 * @summary The Hypergrid theme registry.
 * @desc The standard registry consists of a single theme, `default`, built from values in defaults.js.
 */
var registry = {
    default: defaultTheme
};

/**
 * @param {string} [name] - A registry name for the new theme. May be omitted if the theme has an embedded name (in `theme.themeName`).
 * _If omitted, the 2nd parameter (`theme`) is promoted to first position._
 * @param {HypergridThemeObject} [theme]
 * To build a Hypergrid theme object from a loaded {@link https://polymerthemes.com Polymer Theme} CSS stylesheet:
 * ```javascript
 * var myTheme = require('fin-hypergrid-themes').buildTheme();
 * ```
 * @this {Hypergrid.constructor}
 * @memberOf Hypergrid.
 */
function registerTheme(name, theme) {
    if (arguments.length === 1) {
        theme = name;
        name = theme.themeName;
    }

    if (!name) {
        throw new HypergridError('Cannot register a theme without a name.');
    }

    if (name === 'default') {
        throw new HypergridError('Cannot register or unregister the "default" theme.');
    }

    if (theme) {
        registry[theme.themeName = theme.themeName || name] = theme;
    } else {
        delete registry[name];
    }
}

/**
 * App developers are free to add in additional themes, such as those in {@link https://openfin.github.com/fin-hypergrid-themes/themes}:
 * ```javascript
 * Hypergrind.registerThemes(require('fin-hypergrid-themes'));
 * ```
 */
function registerThemes(themeCollection) {
    _(themeCollection).each(function(theme, name) {
        registerTheme(name, theme);
    });
}

/**
 * Apply props from the given theme object to the global theme object,
 * the `defaults` layer at the bottom of the properties hierarchy.
 *
 * Note that a `themeName` property is always added to override `defaults.themeName`.
 * @this {Hypergrid.constructor}
 * @param {object|string} [theme=registry.default] - One of:
 * * **string:** A registered theme name.
 * * **object:** A theme object.
 * @param {string|undefined} [theme.themeName=undefined]
 * When `theme` is an object but this property is omitted, defaults to an explicit `undefined`.
 * @memberOf Hypergrid.
 */
function applyTheme(theme) {
    if (
        typeof theme === 'undefined' ||
        typeof theme === 'object' && !Object.getOwnPropertyNames(theme).length
    ) {
        theme = 'default';
    }

    if (typeof theme === 'string') {
        if (!registry[theme]) {
            throw new HypergridError('Unknown theme "' + theme + '"');
        }
        theme = registry[theme];
    }

    var newThemeDescriptor = Object.getOwnPropertyDescriptors(theme);

    // When no theme name, set it to explicit `undefined` (to mask defaults.themeName).
    if (!('themeName' in newThemeDescriptor)) {
        newThemeDescriptor.themeName = {
            configurable: true,
            value: undefined
        };
    }

    _(newThemeDescriptor).each(function(descriptor, key) {
        if (key in dynamicPropertyDescriptors) {
            // Dynamic properties are defined on properties layer; defining these
            // r-values on the theme layer is ineffective so let's not allow it.
            delete newThemeDescriptor[key];
        } else {
            // Make sure all the new theme props are configurable so they can be deleted by the next call.
            descriptor.configurable = true;
        }
    });

    // Apply the theme (i.e., add new members to theme layer)
    Object.defineProperties(this._theme, newThemeDescriptor);
}

/**
 * Additions to `Hypergrid.prototype` for setting an instance theme.
 * @mixin
 */
var mixin = {
    initThemeLayer: function() {
        /**
         * Descends from {@link module:defaults|defaults}.
         * @memberOf Hypergrid#
         * @private
         */
        this._theme = Object.create(defaults);

        return Object.create(this._theme, dynamicPropertyDescriptors);
    },

    /**
     * Apply props from the given theme object to the local (instance) object,
     * the instance's `myGrid.themeLayer` layer in the properties hierarchy.
     *
     * Note that a `themeName` property is always added to mask `defaults.themeName`.
     * @param {object|string} [theme=require('./themes').default] - One of:
     * * **string:** A registered theme name.
     * * **object:** A unregistered (anonymous) theme object.
     * @param {string|undefined} [theme.themeName=undefined]
     * When `theme` is an object but this property is omitted, defaults to an explicit `undefined`.
     * @memberOf Hypergrid#
     */
    applyTheme: function(theme) {
        // Before calling the shared `applyTheme` method, delete all the own props of this grid instance's theme layer (defined by previous call)
        var themeLayer = this._theme;
        Object.getOwnPropertyNames(themeLayer).forEach(function(propName) {
            delete themeLayer[propName];
        });

        // Don't call the shared `applyTheme` method with a null or empty theme because it would copy the default theme into this grid instance's theme layer which is not what we want; we just want to remove the instance's theme (already done, above) to reveal the global them underneath.
        if (!theme || typeof theme === 'object' && Object.getOwnPropertyNames(theme).length === 0) {
            return;
        }

        applyTheme.call(this, theme);
    },

    /**
     * @summary Get currently active theme.
     * @desc May return a theme name or a theme object.
     * @returns {string|undefined|object} One of:
     * * **string:** Theme name (registered theme).
     * * **object:** Theme object (unregistered anonymous theme).
     * * **undefined:** No theme (i.e., the default theme).
     * @memberOf Hypergrid#
     */
    getTheme: function() {
        var themeLayer = this._theme,
            themeName = themeLayer.themeName;
        return themeName === 'default' || !Object.getOwnPropertyNames(themeLayer).length
            ? undefined // default theme or no theme
            : themeName in registry
                ? themeName // registered theme name
                : themeLayer; // unregistered theme object
    }
};
Object.defineProperty(mixin, 'theme', {
    enumerable: true,
    set: mixin.applyTheme,
    get: mixin.getTheme
});

/**
 * Shared properties of `Hypergrid` for registering themes and setting a global theme.
 * @mixin
 */
var sharedMixin = {
    registerTheme: registerTheme,
    registerThemes: registerThemes,
    applyTheme: applyTheme
};
Object.defineProperty(sharedMixin, 'theme', { // global theme setter/getter
    enumerable: true,
    set: applyTheme,
    get: function() { return defaults; } // the defaults layer *is* the global theme layer
});


module.exports = {
    mixin: mixin,
    sharedMixin: sharedMixin
};

},{"../defaults":62,"../lib/dynamicProperties":85,"../lib/error":86,"object-iterators":19}],32:[function(require,module,exports){
'use strict';

var Point = require('rectangular').Point;

var Base = require('../Base');
var Column = require('./Column');
var cellEventFactory = require('../lib/cellEventFactory');
var Features = require('../features');
var propClassEnum = require('../defaults.js').propClassEnum;


var noExportProperties = [
    'columnHeader',
    'columnHeaderColumnSelection',
    'filterProperties',
    'rowHeader',
    'rowHeaderRowSelection',
    'rowNumbersProperties',
    'treeColumnProperties',
    'treeColumnPropertiesColumnSelection',
];

/**
 * @mixes subgrids.mixin
 * @constructor
 * @desc A controller for the data model.
 * > This constructor (actually {@link Behavior#initialize}) will be called upon instantiation of this class or of any class that extends from this class. See {@link https://github.com/joneit/extend-me|extend-me} for more info.
 * @param {Hypergrid} grid
 * @param {object} [options] - _(See {@link behaviors.JSON#setData} for additional options.)_
 * @param {DataModels[]} [options.subgrids]
 * @abstract
 */
var Behavior = Base.extend('Behavior', {

    initialize: function(grid, options) {
        /**
         * @type {Hypergrid}
         * @memberOf Behavior#
         */
        this.grid = grid;

        this.initializeFeatureChain();

        this.grid.behavior = this;
        this.reset(options);
    },

    /**
     * @desc Create the feature chain - this is the [chain of responsibility](http://c2.com/cgi/wiki?ChainOfResponsibilityPattern) pattern.
     * @param {Hypergrid} [grid] Unnecesary legacy parameter. May be omitted.
     * @memberOf Behavior#
     */
    initializeFeatureChain: function(grid) {
        var constructors;

        /**
         * @summary Controller chain of command.
         * @desc Each feature is linked to the next feature.
         * @type {Feature}
         * @memberOf Behavior#
         */
        this.featureChain = undefined;

        /**
         * @summary Hash of instantiated features by class names.
         * @desc Built here but otherwise not in use.
         * @type {object}
         * @memberOf Behavior#
         */
        this.featureMap = {};

        this.featureRegistry = this.featureRegistry || new Features;

        if (this.grid.properties.features) {
            var getFeatureConstructor = this.featureRegistry.get.bind(this.featureRegistry);
            constructors = this.grid.properties.features.map(getFeatureConstructor);
        } else if (this.features) {
            constructors = this.features;
            warnBehaviorFeaturesDeprecation.call(this);
        }

        constructors.forEach(function(FeatureConstructor, i) {
            var feature = new FeatureConstructor;

            this.featureMap[feature.$$CLASS_NAME] = feature;

            if (i) {
                this.featureChain.setNext(feature);
            } else {
                this.featureChain = feature;
            }
        }, this);

        if (this.featureChain) {
            this.featureChain.initializeOn(this.grid);
        }
    },

    features: [], // override in implementing class; or provide feature names in grid.properties.features; else no features

    /**
     * @param {object} [options]
     * @memberOf Behavior#
     */
    reset: function(options) {
        if (this.dataModel) {
            this.dataModel.reset(options);
        } else {
            /**
             * @type {dataModelAPI}
             * @memberOf Behavior#
             */
            this.dataModel = this.getNewDataModel(options);

            // recreate `CellEvent` class so it can set up its internal `grid`, `behavior`, and `dataModel` convenience properties
            this.CellEvent = cellEventFactory(this.grid);
        }

        this.scrollPositionX = this.scrollPositionY = 0;

        this.clearColumns();
        this.createColumns();

        /**
         * Ordered list of subgrids to render.
         * @type {subgridSpec[]}
         * @memberOf Hypergrid#
         */
        this.subgrids = options && options.subgrids || this.subgrids || this.grid.properties.subgrids;
    },

    get renderedColumnCount() {
        return this.grid.renderer.visibleColumns.length;
    },

    get renderedRowCount() {
        return this.grid.renderer.visibleRows.length;
    },

    get leftMostColIndex() {
        return this.grid.properties.showRowNumbers ? this.rowColumnIndex : (this.hasTreeColumn() ? this.treeColumnIndex : 0);
    },

    clearColumns: function() {
        var schema = this.dataModel.schema,
            tc = this.treeColumnIndex,
            rc = this.rowColumnIndex;

        schema[tc] = schema[tc] || {
            name: 'Tree',
            header: 'Tree'
        };

        schema[rc] = schema[rc] || {
            name: '',
            header: ''
        };

        /**
         * @type {Column[]}
         * @memberOf Behavior#
         */
        this.columns = [];

        /**
         * @type {Column[]}
         * @memberOf Behavior#
         */
        this.allColumns = [];

        this.allColumns[tc] = this.columns[tc] = this.newColumn({
            index: tc,
            header: schema[tc].header
        });
        this.allColumns[rc] = this.columns[rc] = this.newColumn({
            index: rc,
            header: schema[rc].header
        });

        this.columns[tc].properties.propClassLayers = this.columns[rc].properties.propClassLayers = [propClassEnum.COLUMNS];

        // Signal the renderer to size the now-reset handle column before next render
        this.grid.renderer.resetRowHeaderColumnWidth();
    },

    getActiveColumn: function(x) {
        return this.columns[x];
    },

    /**
     * The "grid index" given a "data index" (or column object)
     * @param {Column|number} columnOrIndex
     * @returns {undefined|number} The grid index of the column or undefined if column not in grid.
     * @memberOf Hypergrid#
     */
    getActiveColumnIndex: function(columnOrIndex) {
        var index = columnOrIndex instanceof Column ? columnOrIndex.index : columnOrIndex;
        for (var i = 0; i < this.columns.length; ++i) {
            if (this.columns[i].index === index) {
                return i;
            }
        }
    },

    getColumn: function(x) {
        return this.allColumns[x];
    },

    newColumn: function(options) {
        return new Column(this, options);
    },

    addColumn: function(options) {
        var column = this.newColumn(options);
        this.columns.push(column);
        this.allColumns.push(column);
        return column;
    },

    createColumns: function() {
        this.clearColumns();
        //concrete implementation here
    },

    getColumnWidth: function(x) {
        var column = this.getActiveColumn(x);
        if (!column) {
            return this.grid.properties.defaultColumnWidth;
        }
        var width = column.getWidth();
        return width;
    },

    /**
     * @param {Column|number} columnOrIndex - The column or active column index.
     * @param width
     * @memberOf Hypergrid#
     */
    setColumnWidth: function(columnOrIndex, width) {
        var column = columnOrIndex >= -2 ? this.getActiveColumn(columnOrIndex) : columnOrIndex;
        column.setWidth(width);
        this.stateChanged();
    },

    /**
     * @memberOf Behavior#
     */
    reindex: function() {
        this.dataModel.reindex();
        this.shapeChanged();
    },

    /**
     * @memberOf Behavior#
     * @desc utility function to empty an object of its members
     * @param {object} obj - the object to empty
     * @param {boolean} [exportProps]
     * * `undefined` (omitted) - delete *all* properties
     * * **falsy** - delete *only* the export properties
     * * **truthy** - delete all properties *except* the export properties
     */
    clearObjectProperties: function(obj, exportProps) {
        for (var key in obj) {
            if (
                obj.hasOwnProperty(key) && (
                    exportProps === undefined ||
                    !exportProps && noExportProperties.indexOf(key) >= 0 ||
                    exportProps && noExportProperties.indexOf(key) < 0
                )
            ) {
                delete obj[key];
            }
        }
    },

    //this is effectively a clone, with certain things removed....
    getState: function() {
        var copy = JSON.parse(JSON.stringify(this.grid.properties));
        this.clearObjectProperties(copy.columnProperties, false);
        return copy;
    },
    /**
     * @memberOf Behavior#
     * @desc clear all table state
     */
    clearState: function() {
        this.grid.clearState();
        this.createColumns();
    },

    /**
     * @memberOf Behavior#
     * @desc Restore this table to a previous state.
     * See the [memento pattern](http://c2.com/cgi/wiki?MementoPattern).
     * @param {Object} memento - assignable grid properties
     */
    setState: function(memento) {
        this.clearState();
        this.addState(memento);
    },

    addState: function(properties) {
        Object.assign(this.grid.properties, properties);
        this.setAllColumnProperties(properties.columnProperties);
        this.dataModel.reindex();
    },

    /**
     * @summary Sets properties of multiple columns.
     * @desc Sets column properties to elements of given array.
     * The array may be sparse; never defined or deleted elements are ignored.
     * In addition, falsy elements are ignored.
     * @param {object[]} columnProperties
     */
    setAllColumnProperties: function(columnProperties) {
        if (columnProperties) {
            columnProperties.forEach(function(properties, i) {
                if (properties) {
                    this.getColumn(i).properties = properties;
                }
            }, this);
        }
    },

    setColumnOrder: function(columnIndexes) {
        if (Array.isArray(columnIndexes)){
            this.columns.length = columnIndexes.length;
            columnIndexes.forEach(function(index, i) {
                this.columns[i] = this.allColumns[index];
            }, this);
        }
    },

    setColumnOrderByName: function(columnNames) {
        if (Array.isArray(columnNames)){
            this.columns.length = columnNames.length;
            columnNames.forEach(function(columnName, i) {
                this.columns[i] = this.allColumns.find(function(column) {
                    return column.name === columnName;
                });
            }, this);
        }
    },

    /**
     * @memberOf Behavior#
     * @desc Rebuild the column order indexes
     * @param {Array} columnIndexes - list of column indexes
     * @param {Boolean} [silent=false] - whether to trigger column changed event
     */
    setColumnIndexes: function(columnIndexes, silent) {
        this.grid.properties.columnIndexes = columnIndexes;
        if (!silent) {
            this.grid.fireSyntheticOnColumnsChangedEvent();
        }
    },

    /**
     * @summary Show inactive column(s) or move active column(s).
     *
     * @desc Adds one or several columns to the "active" column list.
     *
     * @param {boolean} [isActiveColumnIndexes=false] - Which list `columnIndexes` refers to:
     * * `true` - The active column list. This can only move columns around within the active column list; it cannot add inactive columns (because it can only refer to columns in the active column list).
     * * `false` - The full column list (as per column schema array). This inserts columns from the "inactive" column list, moving columns that are already active.
     *
     * @param {number|number[]} columnIndexes - Column index(es) into list as determined by `isActiveColumnIndexes`. One of:
     * * **Scalar column index** - Adds single column at insertion point.
     * * **Array of column indexes** - Adds multiple consecutive columns at insertion point.
     *
     * _This required parameter is promoted left one arg position when `isActiveColumnIndexes` omitted._
     *
     * @param {number} [referenceIndex=this.columns.length] - Insertion point, _i.e.,_ the element to insert before. A negative values skips the reinsert. Default is to insert new columns at end of active column list.
     *
     * _Promoted left one arg position when `isActiveColumnIndexes` omitted._
     *
     * @param {boolean} [allowDuplicateColumns=false] - Unless true, already visible columns are removed first.
     *
     * _Promoted left one arg position when `isActiveColumnIndexes` omitted + one position when `referenceIndex` omitted._
     *
     * @memberOf Behavior#
     */
    showColumns: function(isActiveColumnIndexes, columnIndexes, referenceIndex, allowDuplicateColumns) {
        // Promote args when isActiveColumnIndexes omitted
        if (typeof isActiveColumnIndexes === 'number' || Array.isArray(isActiveColumnIndexes)) {
            allowDuplicateColumns = referenceIndex;
            referenceIndex = columnIndexes;
            columnIndexes = isActiveColumnIndexes;
            isActiveColumnIndexes = false;
        }

        var activeColumns = this.columns,
            sourceColumnList = isActiveColumnIndexes ? activeColumns : this.allColumns;

        // Nest scalar index
        if (typeof columnIndexes === 'number') {
            columnIndexes = [columnIndexes];
        }

        var newColumns = columnIndexes
            // Look up columns using provided indexes
            .map(function(index) { return sourceColumnList[index]; })
            // Remove any undefined columns
            .filter(function(column) { return column; });

        // Default insertion point is end (i.e., before (last+1)th element)
        if (typeof referenceIndex !== 'number') {
            allowDuplicateColumns = referenceIndex; // assume reference index was omitted when not a number
            referenceIndex = activeColumns.length;
        }

        // Remove already visible columns and adjust insertion point
        if (!allowDuplicateColumns) {
            newColumns.forEach(function(column) {
                var i = activeColumns.indexOf(column);
                if (i >= 0) {
                    activeColumns.splice(i, 1);
                    if (referenceIndex > i) {
                        --referenceIndex;
                    }
                }
            });
        }

        // Insert the new columns at the insertion point
        if (referenceIndex >= 0) {
            activeColumns.splice.apply(activeColumns, [referenceIndex, 0].concat(newColumns));
        }

        this.grid.properties.columnIndexes = activeColumns.map(function(column) { return column.index; });
    },

    /**
     * @summary Hide active column(s).
     * @desc Removes one or several columns from the "active" column list.
     * @param {boolean} [isActiveColumnIndexes=false] - Which list `columnIndexes` refers to:
     * * `true` - The active column list.
     * * `false` - The full column list (as per column schema array).
     * @param {number|number[]} columnIndexes - Column index(es) into list as determined by `isActiveColumnIndexes`. One of:
     * * **Scalar column index** - Adds single column at insertion point.
     * * **Array of column indexes** - Adds multiple consecutive columns at insertion point.
     *
     * _This required parameter is promoted left one arg position when `isActiveColumnIndexes` omitted._
     * @memberOf Behavior#
     */
    hideColumns: function(isActiveColumnIndexes, columnIndexes) {
        var args = Array.prototype.slice.call(arguments); // Convert to array so we can add an argument (element)
        args.push(-1); // Remove only; do not reinsert.
        this.showColumns.apply(this, args);
    },

    /**
     * @memberOf Behavior#
     * @desc fetch the value for a property key
     * @returns {*} The value of the given property.
     * @param {string} key - a property name
     */
    resolveProperty: function(key) {
        // todo: remove when we remove the deprecated grid.resolveProperty
        return this.grid.resolveProperty(key);
    },

    /**
     * @memberOf Behavior#
     * @desc A specific cell was clicked; you've been notified.
     * @param {Object} event - all event information
     * @return {boolean} Clicked in a drill-down column.
     */
    cellClicked: function(event) {
        return this.dataModel.cellClicked(event);
    },

    lookupFeature: function(key) {
        return this.featureMap[key];
    },

    /**
     * @param {CellEvent|number} xOrCellEvent - Grid column coordinate.
     * @param {number} [y] - Grid row coordinate. Omit if `xOrCellEvent` is a CellEvent.
     * @param {dataModelAPI} [dataModel] - For use only when `xOrCellEvent` is _not_ a `CellEvent`: Provide a subgrid. If given, x and y are interpreted as data cell coordinates (unadjusted for scrolling). Does not default to the data subgrid, although you can provide it explicitly (`this.subgrids.lookup.data`).
     * @memberOf Behavior#
     */
    getValue: function(xOrCellEvent, y, dataModel) {
        if (typeof xOrCellEvent !== 'object') {
            var x = xOrCellEvent;
            xOrCellEvent = new this.CellEvent;
            if (dataModel) {
                xOrCellEvent.resetDataXY(x, y, dataModel);
            } else {
                xOrCellEvent.resetGridCY(x, y);
            }
        }
        return xOrCellEvent.value;
    },

    /**
     * @summary Gets the number of rows in the data subgrid.
     * @memberOf Behavior.prototype
     */
    getRowCount: function() {
        return this.dataModel.getRowCount();
    },

    /**
     * @memberOf Behavior#
     * @desc update the data at point x, y with value
     * @return The data.
     * @param {CellEvent|number} xOrCellEvent - Grid column coordinate.
     * @param {number} [y] - Grid row coordinate. Omit if `xOrCellEvent` is a CellEvent.
     * @param {Object} value - The value to use. _When `y` omitted, promoted to 2nd arg._
     * @param {dataModelAPI} [dataModel] - For use only when `xOrCellEvent` is _not_ a `CellEvent`: Provide a subgrid. If given, x and y are interpreted as data cell coordinates (unadjusted for scrolling). Does not default to the data subgrid, although you can provide it explicitly (`this.subgrids.lookup.data`).
     * @return {boolean} Consumed.
     */
    setValue: function(xOrCellEvent, y, value, dataModel) {
        if (typeof xOrCellEvent === 'object') {
            value = y;
        } else {
            var x = xOrCellEvent;
            xOrCellEvent = new this.CellEvent;
            if (dataModel) {
                xOrCellEvent.resetDataXY(x, y, dataModel);
            } else {
                xOrCellEvent.resetGridCY(x, y);
            }
        }
        xOrCellEvent.value = value;
    },

    /**
     * @summary Get the cell's own properties object.
     * @desc May be undefined because cells only have their own properties object when at lest one own property has been set.
     * @param {CellEvent|number} xOrCellEvent - Data x coordinate.
     * @param {number} [y] - Grid row coordinate. _Omit when `xOrCellEvent` is a `CellEvent`._
     * @param {dataModelAPI} [dataModel=this.subgrids.lookup.data] - For use only when `xOrCellEvent` is _not_ a `CellEvent`: Provide a subgrid.
     * @returns {undefined|object} The "own" properties of the cell at x,y in the grid. If the cell does not own a properties object, returns `undefined`.
     * @memberOf Behavior#
     */
    getCellOwnProperties: function(xOrCellEvent, y, dataModel) {
        if (arguments.length === 1) {
            // xOrCellEvent is cellEvent
            return xOrCellEvent.column.getCellOwnProperties(xOrCellEvent.dataCell.y, xOrCellEvent.subgrid);
        } else {
            // xOrCellEvent is x
            return this.getColumn(xOrCellEvent).getCellOwnProperties(y, dataModel);
        }
    },

    /**
     * @summary Get the properties object for cell.
     * @desc This is the cell's own properties object if found else the column object.
     *
     * If you are seeking a single specific property, consider calling {@link Behavior#getCellProperty} instead.
     * @param {CellEvent|number} xOrCellEvent - Data x coordinate.
     * @param {number} [y] - Grid row coordinate. _Omit when `xOrCellEvent` is a `CellEvent`._
     * @param {dataModelAPI} [dataModel=this.subgrids.lookup.data] - For use only when `xOrCellEvent` is _not_ a `CellEvent`: Provide a subgrid.
     * @return {object} The properties of the cell at x,y in the grid.
     * @memberOf Behavior#
     */
    getCellProperties: function(xOrCellEvent, y, dataModel) {
        if (arguments.length === 1) {
            // xOrCellEvent is cellEvent
            return xOrCellEvent.properties;
        } else {
            // xOrCellEvent is x
            return this.getColumn(xOrCellEvent).getCellProperties(y, dataModel);
        }
    },

    /**
     * @summary Return a specific cell property.
     * @desc If there is no cell properties object, defers to column properties object.
     * @param {CellEvent|number} xOrCellEvent - Data x coordinate.
     * @param {number} [y] - Grid row coordinate._ Omit when `xOrCellEvent` is a `CellEvent`._
     * @param {string} key - Name of property to get. _When `y` omitted, this param promoted to 2nd arg._
     * @param {dataModelAPI} [dataModel=this.subgrids.lookup.data] - For use only when `xOrCellEvent` is _not_ a `CellEvent`: Provide a subgrid.
     * @return {object} The specified property for the cell at x,y in the grid.
     * @memberOf Behavior#
     */
    getCellProperty: function(xOrCellEvent, y, key, dataModel) {
        if (typeof xOrCellEvent === 'object') {
            key = y;
            return xOrCellEvent.properties[y];
        } else {
            return this.getColumn(xOrCellEvent).getCellProperty(y, key, dataModel);
        }
    },

    /**
     * @memberOf Behavior#
     * @desc update the data at point x, y with value
     * @param {CellEvent|number} xOrCellEvent - Data x coordinate.
     * @param {number} [y] - Grid row coordinate. _Omit when `xOrCellEvent` is a `CellEvent`._
     * @param {Object} properties - Hash of cell properties. _When `y` omitted, this param promoted to 2nd arg._
     * @param {dataModelAPI} [dataModel=this.subgrids.lookup.data] - For use only when `xOrCellEvent` is _not_ a `CellEvent`: Provide a subgrid.
     */
    setCellProperties: function(xOrCellEvent, y, properties, dataModel) {
        if (typeof xOrCellEvent === 'object') {
            properties = y;
            return xOrCellEvent.column.setCellProperties(xOrCellEvent.dataCell.y, properties, xOrCellEvent.subgrid);
        } else {
            return this.getColumn(xOrCellEvent).setCellProperties(y, properties, dataModel);
        }
    },

    /**
     * @memberOf Behavior#
     * @desc update the data at point x, y with value
     * @param {CellEvent|number} xOrCellEvent - Data x coordinate.
     * @param {number} [y] - Grid row coordinate. _Omit when `xOrCellEvent` is a `CellEvent`._
     * @param {Object} properties - Hash of cell properties. _When `y` omitted, this param promoted to 2nd arg._
     * @param {dataModelAPI} [dataModel=this.subgrids.lookup.data] - For use only when `xOrCellEvent` is _not_ a `CellEvent`: Provide a subgrid.
     */
    addCellProperties: function(xOrCellEvent, y, properties, dataModel) {
        if (typeof xOrCellEvent === 'object') {
            properties = y;
            return xOrCellEvent.column.addCellProperties(xOrCellEvent.dataCell.y, properties, xOrCellEvent.subgrid); // y omitted so y here is actually properties
        } else {
            return this.getColumn(xOrCellEvent).addCellProperties(y, properties, dataModel);
        }
    },

    /**
     * @summary Set a specific cell property.
     * @desc If there is no cell properties object, defers to column properties object.
     *
     * NOTE: For performance reasons, renderer's cell event objects cache their respective cell properties objects. This method accepts a `CellEvent` overload. Whenever possible, use the `CellEvent` from the renderer's cell event pool. Doing so will reset the cell properties object cache.
     *
     * If you use some other `CellEvent`, the renderer's `CellEvent` properties cache will not be automatically reset until the whole cell event pool is reset on the next call to {@link Renderer#computeCellBoundaries}. If necessary, you can "manually" reset it by calling {@link Renderer#resetCellPropertiesCache|resetCellPropertiesCache(yourCellEvent)} which searches the cell event pool for one with matching coordinates and resets the cache.
     *
     * The raw coordinates overload calls the `resetCellPropertiesCache(x, y)` overload for you.
     * @param {CellEvent|number} xOrCellEvent - `CellEvent` or data x coordinate.
     * @param {number} [y] - Grid row coordinate. _Omit when `xOrCellEvent` is a `CellEvent`._
     * @param {string} key - Name of property to get. _When `y` omitted, this param promoted to 2nd arg._
     * @param value
     * @param {dataModelAPI} [dataModel=this.subgrids.lookup.data] - For use only when `xOrCellEvent` is _not_ a `CellEvent`: Provide a subgrid.
     * @memberOf Behavior#
     */
    setCellProperty: function(xOrCellEvent, y, key, value, dataModel) {
        var cellOwnProperties;
        if (typeof xOrCellEvent === 'object') {
            value = key;
            key = y;
            cellOwnProperties = xOrCellEvent.setCellProperty(key, value);
        } else {
            cellOwnProperties = this.getColumn(xOrCellEvent).setCellProperty(y, key, value, dataModel);
            this.grid.renderer.resetCellPropertiesCache(xOrCellEvent, y, dataModel);
        }
        return cellOwnProperties;
    },

    /**
     * @summary The total height of the "fixed rows."
     * @desc The total height of all (non-scrollable) rows preceding the (scrollable) data subgrid.
     * @memberOf Behavior#
     * @return {number} The height in pixels of the fixed rows area of the hypergrid, the total height of:
     * 1. All rows of all subgrids preceding the data subgrid.
     * 2. The first `fixedRowCount` rows of the data subgrid.
     */
    getFixedRowsHeight: function() {
        var dataModel, isData, r, R,
            subgrids = this.subgrids,
            height = 0;

        for (var i = 0; i < subgrids.length && !isData; ++i) {
            dataModel = subgrids[i];
            isData = dataModel.isData;
            R = isData ? this.grid.properties.fixedRowCount : dataModel.getRowCount();
            for (r = 0; r < R; ++r) {
                height += this.getRowHeight(r, dataModel);
            }
        }

        return height;
    },

    /**
     * @memberOf Behavior#
     * @param {number|CellEvent} yOrCellEvent - Data row index local to `dataModel`; or a `CellEvent` object.
     * @param {boolean} [properties] - New properties object when one does not already exist. If you don't provide this and one does not already exist, this call will return `undefined`. _(Required when 3rd param provided.)_
     * @param {dataModelAPI} [dataModel=this.dataModel] - This is the subgrid. You only need to provide the subgrid when it is not the data subgrid _and_ you did not give a `CellEvent` object in the first param (which already knows what subgrid it's in).
     * @returns {object|undefined} The row properties object which will be one of:
     * * The row properties object if it existed.
     * * The value you provided in `properties` if the row properties for a new row properties object when the object did not already exist in the metadata
     * * `undefined` if the row properties object did not exist _and_ you did not provide a value in `properties`.
     */
    getRowProperties: function(yOrCellEvent, properties, dataModel) {
        if (typeof yOrCellEvent === 'object') {
            yOrCellEvent = yOrCellEvent.dataCell.y;
            dataModel = yOrCellEvent.subgrid;
        }

        var metadata = (dataModel || this.dataModel).getRowMetadata(yOrCellEvent, properties && {});
        return metadata && (metadata.__ROW || (metadata.__ROW = properties));
    },

    /**
     * Reset the row properties in its entirety to the given row properties object.
     * @memberOf Behavior#
     * @param {number|CellEvent} yOrCellEvent - Data row index local to `dataModel`; or a `CellEvent` object.
     * @param {object} properties - The new row properties object.
     * @param {dataModelAPI} [dataModel=this.dataModel] - This is the subgrid. You only need to provide the subgrid when it is not the data subgrid _and_ you did not give a `CellEvent` object in the first param (which already knows what subgrid it's in).
     */
    setRowProperties: function(yOrCellEvent, properties, dataModel) {
        if (typeof yOrCellEvent === 'object') {
            yOrCellEvent = yOrCellEvent.dataCell.y;
            dataModel = yOrCellEvent.subgrid;
        }

        (dataModel || this.dataModel).getRowMetadata(yOrCellEvent, {}, dataModel).__ROW = properties;

        this.stateChanged();
    },

    /**
     * Sets a single row property on a specific individual row.
     * @memberOf Behavior#
     * @param {number|CellEvent} yOrCellEvent - Data row index local to `dataModel`; or a `CellEvent` object.
     * @param {string} key - The property name.
     * @param value - The new property value.
     * @param {dataModelAPI} [dataModel=this.dataModel] - This is the subgrid. You only need to provide the subgrid when it is not the data subgrid _and_ you did not give a `CellEvent` object in the first param (which already knows what subgrid it's in).
     */
    setRowProperty: function(yOrCellEvent, key, value, dataModel) {
        this.getRowProperties(yOrCellEvent, {}, dataModel)[key] = value;
        this.stateChanged();
    },

    /**
     * Add all the properties in the given row properties object to the row properties.
     * @memberOf Behavior#
     * @param {number|CellEvent} yOrCellEvent - Data row index local to `dataModel`; or a `CellEvent` object.
     * @param {object} properties - An object containing new property values(s) to assign to the row properties.
     * @param {dataModelAPI} [dataModel=this.dataModel] - This is the subgrid. You only need to provide the subgrid when it is not the data subgrid _and_ you did not give a `CellEvent` object in the first param (which already knows what subgrid it's in).
     */
    addRowProperties: function(yOrCellEvent, properties, dataModel) {
        Object.assign(this.getRowProperties(yOrCellEvent, {}, dataModel), properties);
        this.stateChanged();
    },

    /**
     * @memberOf Behavior#
     * @param {number} yOrCellEvent - Data row index local to `dataModel`.
     * @param {dataModelAPI} [dataModel=this.dataModel]
     * @returns {number} The row height in pixels.
     */
    getRowHeight: function(yOrCellEvent, dataModel) {
        var rowProps = this.getRowProperties(yOrCellEvent, undefined, dataModel);
        return rowProps && rowProps.height || this.grid.properties.defaultRowHeight;
    },

    /**
     * @memberOf Behavior#
     * @desc set the pixel height of a specific row
     * @param {number} yOrCellEvent - Data row index local to dataModel.
     * @param {number} height - pixel height
     * @param {dataModelAPI} [dataModel=this.dataModel]
     */
    setRowHeight: function(yOrCellEvent, height, dataModel) {
        var rowProps = this.getRowProperties(yOrCellEvent, {}, dataModel),
            oldHeight = rowProps.height;

        rowProps.height = Math.max(5, Math.ceil(height));

        if (rowProps.height !== oldHeight) {
            this.stateChanged();
        }
    },

    /**
     * @memberOf Behavior#
     * @return {number} The width of the fixed column area in the hypergrid.
     */
    getFixedColumnsWidth: function() {
        var count = this.getFixedColumnCount(),
            total = 0,
            i = this.leftMostColIndex;

        for (; i < count; i++) {
            total += this.getColumnWidth(i);
        }
        return total;
    },

    /**
     * @memberOf Behavior#
     * @desc This exists to support "floating" columns.
     * @return {number} The total width of the fixed columns area.
     */
    getFixedColumnsMaxWidth: function() {
        return this.getFixedColumnsWidth();
    },

    /**
     * @memberOf Behavior#
     * @desc Set the scroll position in vertical dimension and notify listeners.
     * @param {number} y - the new y value
     */
    _setScrollPositionY: function(y) {
        this.setScrollPositionY(y);
        this.changed();
    },

    /**
     * @memberOf Behavior#
     * @desc Set the scroll position in horizontal dimension and notify listeners.
     * @param {number} x - the new x value
     */
    _setScrollPositionX: function(x) {
        this.setScrollPositionX(x);
        this.changed();
    },

    /**
     * @memberOf Behavior#
     * @desc The fixed row area has been clicked, massage the details and call the real function.
     * @param {Hypergrid} grid
     * @param {Object} mouse - event details
     */
    _fixedRowClicked: function(grid, mouse) {
        var x = this.translateColumnIndex(this.getScrollPositionX() + mouse.gridCell.x - this.getFixedColumnCount());
        var translatedPoint = new Point(x, mouse.gridCell.y);
        mouse.gridCell = translatedPoint;
        this.fixedRowClicked(grid, mouse);
    },

    /**
     * @memberOf Behavior#
     * @desc The fixed column area has been clicked, massage the details and call the real function.
     * @param {Hypergrid} grid
     * @param {Object} mouse - event details
     */
    _fixedColumnClicked: function(grid, mouse) {
        var translatedPoint = new Point(mouse.gridCell.x, this.getScrollPositionY() + mouse.gridCell.y - this.getFixedRowCount());
        mouse.gridCell = translatedPoint;
        this.fixedColumnClicked(grid, mouse);
    },

    /**
     * @memberOf Behavior#
     * @desc delegate setting the cursor up the feature chain of responsibility
     * @param {Hypergrid} grid
     */
    setCursor: function(grid) {
        grid.updateCursor();
        this.featureChain.setCursor(grid);
    },

    /**
     * @memberOf Behavior#
     * @desc delegate handling mouse move to the feature chain of responsibility
     * @param {Hypergrid} grid
     * @param {Object} event - the event details
     */
    onMouseMove: function(grid, event) {
        if (this.featureChain) {
            this.featureChain.handleMouseMove(grid, event);
            this.setCursor(grid);
        }
    },

    /**
     * @memberOf Behavior#
     * @desc delegate handling tap to the feature chain of responsibility
     * @param {Hypergrid} grid
     * @param {Object} event - the event details
     */
    onClick: function(grid, event) {
        if (this.featureChain) {
            this.featureChain.handleClick(grid, event);
            this.setCursor(grid);
        }
    },

    /**
     * @memberOf Behavior#
     * @desc delegate handling tap to the feature chain of responsibility
     * @param {Hypergrid} grid
     * @param {Object} event - the event details
     */
    onContextMenu: function(grid, event) {
        if (this.featureChain) {
            this.featureChain.handleContextMenu(grid, event);
            this.setCursor(grid);
        }
    },

    /**
     * @memberOf Behavior#
     * @desc delegate handling wheel moved to the feature chain of responsibility
     * @param {Hypergrid} grid
     * @param {Object} event - the event details
     */
    onWheelMoved: function(grid, event) {
        if (this.featureChain) {
            this.featureChain.handleWheelMoved(grid, event);
            this.setCursor(grid);
        }
    },

    /**
     * @memberOf Behavior#
     * @desc delegate handling mouse up to the feature chain of responsibility
     * @param {Hypergrid} grid
     * @param {Object} event - the event details
     */
    onMouseUp: function(grid, event) {
        if (this.featureChain) {
            this.featureChain.handleMouseUp(grid, event);
            this.setCursor(grid);
        }
    },

    /**
     * @memberOf Behavior#
     * @desc delegate handling mouse drag to the feature chain of responsibility
     * @param {Hypergrid} grid
     * @param {Object} event - the event details
     */
    onMouseDrag: function(grid, event) {
        if (this.featureChain) {
            this.featureChain.handleMouseDrag(grid, event);
            this.setCursor(grid);
        }
    },

    /**
     * @memberOf Behavior#
     * @desc delegate handling key down to the feature chain of responsibility
     * @param {Hypergrid} grid
     * @param {Object} event - the event details
     */
    onKeyDown: function(grid, event) {
        if (this.featureChain) {
            this.featureChain.handleKeyDown(grid, event);
            this.setCursor(grid);
        }
    },

    /**
     * @memberOf Behavior#
     * @desc delegate handling key up to the feature chain of responsibility
     * @param {Hypergrid} grid
     * @param {Object} event - the event details
     */
    onKeyUp: function(grid, event) {
        if (this.featureChain) {
            this.featureChain.handleKeyUp(grid, event);
            this.setCursor(grid);
        }
    },

    /**
     * @memberOf Behavior#
     * @desc delegate handling double click to the feature chain of responsibility
     * @param {Hypergrid} grid
     * @param {Object} event - the event details
     */
    onDoubleClick: function(grid, event) {
        if (this.featureChain) {
            this.featureChain.handleDoubleClick(grid, event);
            this.setCursor(grid);
        }
    },
    /**
     * @memberOf Behavior#
     * @desc delegate handling mouse down to the feature chain of responsibility
     * @param {Hypergrid} grid
     * @param {Object} event - the event details
     */
    handleMouseDown: function(grid, event) {
        if (this.featureChain) {
            this.featureChain.handleMouseDown(grid, event);
            this.setCursor(grid);
        }
    },

    /**
     * @memberOf Behavior#
     * @desc delegate handling mouse exit to the feature chain of responsibility
     * @param {Hypergrid} grid
     * @param {Object} event - the event details
     */
    handleMouseExit: function(grid, event) {
        if (this.featureChain) {
            this.featureChain.handleMouseExit(grid, event);
            this.setCursor(grid);
        }
    },

    /**
     * @memberOf Behavior#
     * @desc I've been notified that the behavior has changed.
     */
    changed: function() { this.grid.behaviorChanged(); },

    /**
     * @memberOf Behavior#
     * @desc The dimensions of the grid data have changed. You've been notified.
     */
    shapeChanged: function() { this.grid.behaviorShapeChanged(); },

    /**
     * @memberOf Behavior#
     * @desc The dimensions of the grid data have changed. You've been notified.
     */
    stateChanged: function() { this.grid.behaviorStateChanged(); },

    /**
     * @memberOf Behavior#
     * @return {boolean} Can re-order columns.
     */
    isColumnReorderable: function() {
        return this.grid.properties.columnsReorderable;
    },

    /**
     * @param {index} x - Data x coordinate.
     * @return {Object} The properties for a specific column.
     * @memberOf Behavior#
     */
    getColumnProperties: function(x) {
        var column = this.getColumn(x);
        return column && column.properties;
    },

    /**
     * @param {index} x - Data x coordinate.
     * @return {Object} The properties for a specific column.
     * @memberOf Behavior#
     */
    setColumnProperties: function(x, properties) {
        var column = this.getColumn(x);
        if (!column) {
            throw 'Expected column.';
        }
        var result = Object.assign(column.properties, properties);
        this.changed();
        return result;
    },

    /**
     * Clears all cell properties of given column or of all columns.
     * @param {number} [x] - Omit for all columns.
     * @memberOf Behavior#
     */
    clearAllCellProperties: function(x) {
        if (x !== undefined) {
            var column = this.getColumn(x);
            if (column) {
                column.clearAllCellProperties();
            }
        } else if (this.subgrids) {
            this.subgrids.forEach(function(dataModel) {
                for (var i = dataModel.getRowCount(); i--;) {
                    dataModel.setRowMetadata(i);
                }
            });
        }
    },

    /**
     * @memberOf Behavior#
     * @return {string[]} All the currently hidden column header labels.
     */
    getHiddenColumnDescriptors: function() {
        var tableState = this.grid.properties;
        var indexes = tableState.columnIndexes;
        var labels = [];
        var columnCount = this.getActiveColumnCount();
        for (var i = 0; i < columnCount; i++) {
            if (indexes.indexOf(i) === -1) {
                var column = this.getActiveColumn(i);
                labels.push({
                    id: i,
                    header: column.header,
                    field: column.name
                });
            }
        }
        return labels;
    },

    /**
     * @memberOf Behavior#
     * @return {number} The number of fixed columns.
     */
    getFixedColumnCount: function() {
        return this.grid.properties.fixedColumnCount;
    },

    /**
     * @memberOf Behavior#
     * @desc set the number of fixed columns
     * @param {number} n - the integer count of how many columns to be fixed
     */
    setFixedColumnCount: function(n) {
        this.grid.properties.fixedColumnCount = n;
    },

    /**
     * @summary The number of "fixed rows."
     * @desc The number of (non-scrollable) rows preceding the (scrollable) data subgrid.
     * @memberOf Behavior#
     * @return {number} The sum of:
     * 1. All rows of all subgrids preceding the data subgrid.
     * 2. The first `fixedRowCount` rows of the data subgrid.
     */
    getFixedRowCount: function() {
        return (
            this.grid.getHeaderRowCount() +
            this.grid.properties.fixedRowCount
        );
    },

    /**
     * @memberOf Behavior#
     * @desc Set the number of fixed rows, which includes (top to bottom order):
     * 1. The header rows
     *    1. The header labels row (optional)
     *    2. The filter row (optional)
     *    3. The top total rows (0 or more)
     * 2. The non-scrolling rows (externally called "the fixed rows")
     *
     * @returns {number} Sum of the above or 0 if none of the above are in use.
     *
     * @param {number} The number of rows.
     */
    setFixedRowCount: function(n) {
        this.grid.properties.fixedRowCount = n;
    },

    /**
     * @memberOf Behavior#
     * @desc a dnd column has just been dropped, we've been notified
     */
    endDragColumnNotification: function() {},

    /**
     * @memberOf Behavior#
     * @return {null} the cursor at a specific x,y coordinate
     * @param {number} x - the x coordinate
     * @param {number} y - the y coordinate
     */
    getCursorAt: function(x, y) {
        return null;
    },

    /**
     * Number of _visible_ columns.
     * @memberOf Behavior#
     * @return {number} The total number of columns.
     */
    getActiveColumnCount: function() {
        return this.columns.length;
    },

    /**
     * @summary Column alignment of given grid column.
     * @desc One of:
     * * `'left'`
     * * `'center'`
     * * `'right'`
     *
     * Cascades to grid.
     * @memberOf Behavior#
     * @desc Quietly set the horizontal scroll position.
     * @param {number} x - The new position in pixels.
     */
    setScrollPositionX: function(x) {
        /**
         * @memberOf Behavior#
         * @type {number}
         */
        this.scrollPositionX = x;
    },

    getScrollPositionX: function() {
        return this.scrollPositionX;
    },

    /**
     * @memberOf Behavior#
     * @desc Quietly set the vertical scroll position.
     * @param {number} y - The new position in pixels.
     */
    setScrollPositionY: function(y) {
        /**
         * @memberOf Behavior#
         * @type {number}
         */
        this.scrollPositionY = y;
    },

    getScrollPositionY: function() {
        return this.scrollPositionY;
    },

    /**
     * @memberOf Behavior#
     * @return {cellEditor} The cell editor for the cell at the given coordinates.
     * @param {CellEvent} editPoint - The grid cell coordinates.
     */
    getCellEditorAt: function(event) {
        return event.isDataColumn && event.column.getCellEditorAt(event);
    },

    /**
     * @memberOf Behavior#
     * @return {boolean} `true` if we should highlight on hover
     * @param {boolean} isColumnHovered - the column is hovered or not
     * @param {boolean} isRowHovered - the row is hovered or not
     */
    highlightCellOnHover: function(isColumnHovered, isRowHovered) {
        return isColumnHovered && isRowHovered;
    },

    /**
     * @memberOf Behavior#
     * @desc this function is a hook and is called just before the painting of a cell occurs
     * @param {Point} cell
     */
    cellPropertiesPrePaintNotification: function(cell) {

    },

    /**
     * @memberOf Behavior#
     * @desc this function is a hook and is called just before the painting of a fixed row cell occurs
     * @param {Point} cell
     */
    cellFixedRowPrePaintNotification: function(cell) {

    },

    /**
     * @memberOf Behavior#
     * @desc this function is a hook and is called just before the painting of a fixed column cell occurs
     * @param {Point} cell
     */
    cellFixedColumnPrePaintNotification: function(cell) {

    },

    /**
     * @memberOf Behavior#
     * @desc this function is a hook and is called just before the painting of a top left cell occurs
     * @param {Point} cell
     */
    cellTopLeftPrePaintNotification: function(cell) {

    },

    /**
     * @memberOf Behavior#
     * @desc swap src and tar columns
     * @param {number} src - column index
     * @param {number} tar - column index
     */
    swapColumns: function(source, target) {
        var columns = this.columns;
        var tmp = columns[source];
        columns[source] = columns[target];
        columns[target] = tmp;
        this.changed();
    },

    getColumnEdge: function(c, renderer) {
        return this.dataModel.getColumnEdge(c, renderer);
    },

    /**
     * @memberOf Behavior#
     * @return {object} The object at y index.
     * @param {number} y - the row index of interest
     */
    getRow: function(y) {
        return this.dataModel.getRow(y);
    },

    convertViewPointToDataPoint: function(unscrolled) {
        return new Point(
            this.getActiveColumn(unscrolled.x).index,
            unscrolled.y
        );
    },

    hasTreeColumn: function() {
        return false;
    },

    getSelectionMatrixFunction: function(selectedRows) {
        return function() {
            return null;
        };
    },

    getRowHeaderColumn: function() {
        return this.allColumns[this.rowColumnIndex];
    },

    autosizeAllColumns: function() {
        this.checkColumnAutosizing(true);
        this.changed();
    },

    checkColumnAutosizing: function(force) {
        force = force === true;
        var autoSized = this.autoSizeRowNumberColumn() ||
            this.hasTreeColumn() && this.getRowHeaderColumn().checkColumnAutosizing(force);
        this.allColumns.forEach(function(column) {
            autoSized = column.checkColumnAutosizing(force) || autoSized;
        });
        return autoSized;
    },

    autoSizeRowNumberColumn: function() {
        if (this.grid.properties.showRowNumbers && this.grid.properties.rowNumberAutosizing) {
            return this.getRowHeaderColumn().checkColumnAutosizing(true);
        }
    },

    get charMap() {
        return this.dataModel.charMap;
    },

    getColumns: function() {
        return this.allColumns;
    },

    getActiveColumns: function() {
        return this.columns;
    },

    getHiddenColumns: function() {
        var visible = this.columns;
        var all = this.allColumns;
        var hidden = [];
        for (var i = 0; i < all.length; i++) {
            if (visible.indexOf(all[i]) === -1) {
                hidden.push(all[i]);
            }
        }
        hidden.sort(function(a, b) {
            return a.header < b.header;
        });
        return hidden;
    },

    getSelectedRows: function() {
        return this.grid.selectionModel.getSelectedRows();
    },

    getSelectedColumns: function() {
        return this.grid.selectionModel.getSelectedColumns();
    },

    getSelections: function() {
        return this.grid.selectionModel.getSelections();
    },

    getData: function() {
        return this.dataModel.getData();
    },

    getIndexedData: function() {
       this.dataModel.getIndexedData();
    }
});


// define constants as immutable (i.e., !writable)
Object.defineProperties(Behavior.prototype, {
    treeColumnIndex: { value: -1 },
    rowColumnIndex: { value: -2 }
});


function warnBehaviorFeaturesDeprecation() {
    var featureNames = [], unregisteredFeatures = [], n = 0;

    this.features.forEach(function(FeatureConstructor) {
        var className = FeatureConstructor.prototype.$$CLASS_NAME || FeatureConstructor.name,
            featureName = className || 'feature' + n++;

        // build list of feature names
        featureNames.push(featureName);

        // build list of unregistered features
        if (!this.featureRegistry.get(featureName, true)) {
            var constructorName = FeatureConstructor.name || FeatureConstructor.prototype.$$CLASS_NAME || 'FeatureConstructor' + n,
                params = [];
            if (!className) {
                params.push('\'' + featureName + '\'');
            }
            params.push(constructorName);
            unregisteredFeatures.push(params.join(', '));
        }
    }, this);

    if (featureNames.length) {
        var sampleCode = 'Hypergrid.defaults.features = [\n' + join('\t\'', featureNames, '\',\n') + '];';

        if (unregisteredFeatures.length) {
            sampleCode += '\n\nThe following custom features are unregistered and will need to be registered prior to behavior instantiation:\n\n' +
                join('Features.add(', unregisteredFeatures, ');\n');
        }

        if (n) {
            sampleCode += '\n\n(You should provide meaningful names for your custom features rather than the generated names above.)';
        }

        console.warn('`grid.behavior.features` (array of feature constructors) has been deprecated as of version 2.1.0 in favor of `grid.properties.features` (array of feature names). Remove `features` array from your behavior and add `features` property to your grid state object (or Hypergrid.defaults), e.g.:\n\n' + sampleCode);
    }
}

function join(prefix, array, suffix) {
    return prefix + array.join(suffix + prefix) + suffix;
}


// synonyms

/**
 * Synonym of {@link Behavior#reindex}.
 * @name applyAnalytics
 * @deprecated
 * @memberOf Behavior#
 */
Behavior.prototype.applyAnalytics = Behavior.prototype.reindex;


// mix-ins
Behavior.prototype.mixIn(require('./subgrids').mixin);


module.exports = Behavior;

},{"../Base":25,"../defaults.js":62,"../features":76,"../lib/cellEventFactory":83,"./Column":33,"./subgrids":38,"rectangular":22}],33:[function(require,module,exports){
/* eslint-env browser */

'use strict';

var overrider = require('overrider');

var HypergridError = require('../lib/error');
var images = require('../../images');

/** @summary Create a new `Column` object.
 * @see {@link module:Cell} is mixed into Column.prototype.
 * @mixes cellProperties.mixin
 * @mixes columnProperties.mixin
 * @constructor
 * @param behavior
 * @param {number|string|object} indexOrOptions - One of:
 * * If a positive number, valid index into `fields` array.
 * * If a string, a name in the `fields` array.
 * * If an object, must contain either an `index` or a `name` property.
 *
 * Positive values of `index` are "real" fields; see also {@link Column#setProperties|setProperties} which is called to set the remaining properties specified in `options`.
 *
 * Negative values of `index` are special cases:
 * `index` | Meaning
 * :-----: | --------
 *    -1   | Row header column
 *    -2   | Tree (drill-down) column
 */
function Column(behavior, indexOrOptions) {
    var index, schema, options, icon;

    this.behavior = behavior;
    this.dataModel = behavior.dataModel;

    schema = this.behavior.dataModel.schema;

    switch (typeof indexOrOptions) {
        case 'number':
            index = indexOrOptions;
            options = {};
            break;
        case 'string':
            index = getIndexFromName(indexOrOptions);
            options = {};
            break;
        case 'object':
            options = indexOrOptions;
            index = options.index !== undefined
                ? options.index
                : getIndexFromName(options.name);
    }

    function getIndexFromName(name) {
        return schema.findIndex(function(columnSchema, i) {
            return columnSchema.name === name;
        });
    }

    if (index === undefined) {
        throw 'Column not found in data.';
    }

    this._index = index;

    this.properties = options;

    switch (index) {
        case this.behavior.treeColumnIndex:
            // Width of icon + 3-pixel spacer (checked and unchecked should be same width)
            icon = images[Object.create(this.properties.treeHeader, { isDataRow: { value: true } }).leftIcon];
            this.properties.minimumColumnWidth = icon ? icon.width + 3 : 0;
            break;
        case this.behavior.rowColumnIndex:
            break;
        default:
            if (index < 0) {
                throw '`index` out of range';
            }
    }
}

Column.prototype = {
    constructor: Column.prototype.constructor,
    $$CLASS_NAME: 'Column',

    HypergridError: HypergridError,

    mixIn: overrider.mixIn,

    /**
     * @summary Index of this column in the `fields` array.
     * @returns {number}
     */
    get index() { // read-only (no setter)
        return this._index;
    },

    /**
     * @summary Name of this column from the `fields` array.
     * @returns {string|undefined} Returns `undefined` if the column is not in the schema (such as for handle column).
     */
    get name() { // read-only (no setter)
        var columnSchema = this.dataModel.schema[this._index];
        return columnSchema && columnSchema.name;
    },

    /**
     * @summary Get or set the text of the column's header.
     * @desc The _header_ is the label at the top of the column.
     *
     * Setting the header updates both:
     * * the `fields` (aka, header) array in the underlying data source; and
     * * the filter.
     * @type {string}
     */
    set header(headerText) {
        this.dataModel.schema[this.index].header = headerText;
        this.behavior.grid.repaint();
    },
    get header() {
        return this.dataModel.schema[this.index].header;
    },

    /**
     * @summary Get or set the computed column's calculator function.
     * @desc Setting the value here updates the calculator in both:
     * * the `calculator` array in the underlying data source; and
     * * the filter.
     *
     * The results of the new calculations will appear in the column cells on the next repaint.
     * @type {string}
     */
    set calculator(calculator) {
        var schema = this.dataModel.schema;
        if (calculator !== schema[this.index].calculator) {
            if (calculator === undefined) {
                delete schema[this.index].calculator;
            } else {
                schema[this.index].calculator = calculator;
            }
            this.behavior.reindex();
        }
    },
    get calculator() {
        return this.dataModel.schema[this.index].calculator;
    },

    /**
     * @summary Get or set the type of the column's header.
     * @desc Setting the type updates the filter which typically uses this information for proper collation.
     *
     * @todo: Instead of using `this._type`, put on data source like the other essential properties. In this case, sorter could use the info to choose a comparator more intelligently and efficiently.
     * @type {string}
     */
    set type(type) {
        this._type = type;
        //TODO: This is calling reindex for every column during grid init. Maybe defer all reindex calls until after a grid 'ready' event
        this.behavior.reindex();
    },
    get type() {
        return this._type;
    },

    getValue: function(y) {
        return this.dataModel.getValue(this.index, y);
    },

    setValue: function(y, value) {
        return this.dataModel.setValue(this.index, y, value);
    },

    getWidth: function() {
        return this.properties.width || this.behavior.grid.properties.defaultColumnWidth;
    },

    setWidth: function(width) {
        width = Math.max(this.properties.minimumColumnWidth, width);
        if (width !== this.properties.width) {
            this.properties.width = width;
            this.properties.columnAutosizing = false;
        }
    },

    checkColumnAutosizing: function(force) {
        var properties = this.properties,
            width, preferredWidth, autoSized;

        if (properties.columnAutosizing) {
            width = properties.width;
            preferredWidth = properties.preferredWidth || width;
            force = force || !properties.columnAutosized;
            if (width !== preferredWidth || force && preferredWidth !== undefined) {
                properties.width = force ? preferredWidth : Math.max(width, preferredWidth);
                properties.columnAutosized = !isNaN(properties.width);
                autoSized = properties.width !== width;
            }
        }

        return autoSized;
    },

    getCellType: function(y) {
        var value = this.getValue(y);
        return this.typeOf(value);
    },

    getType: function() {
        var props = this.properties;
        var type = props.type;
        if (!type) {
            type = this.computeColumnType();
            if (type !== 'unknown') {
                props.type = type;
            }
        }
        return type;
    },

    computeColumnType: function() {
        var headerRowCount = this.behavior.getHeaderRowCount();
        var height = this.behavior.getRowCount();
        var value = this.getValue(headerRowCount);
        var eachType = this.typeOf(value);
        if (!eachType) {
            return 'unknown';
        }
        var type = this.typeOf(value);
        //var isNumber = ((typeof value) === 'number');
        for (var y = headerRowCount; y < height; y++) {
            value = this.getValue(y);
            eachType = this.typeOf(value);
            // if (type !== eachType) {
            //     if (isNumber && (typeof value === 'number')) {
            //         type = 'float';
            //     } else {
            //         return 'mixed';
            //     }
            // }
        }
        return type;
    },

    typeOf: function(something) {
        if (something == null) {
            return null;
        }
        var typeOf = typeof something;
        switch (typeOf) {
            case 'object':
                return something.constructor.name.toLowerCase();
            case 'number':
                return parseInt(something) === something ? 'int' : 'float';
            default:
                return typeOf;
        }
    },

    get properties() {
        return this._properties;
    },
    set properties(ownProperties) {
        this._properties = this.createColumnProperties();
        this.addProperties(ownProperties);
    },

    /** This method is provided because some grid renderer optimizations require that the grid renderer be informed when column colors change. Due to performance concerns, they cannot take the time to figure it out for themselves. Along the same lines, making the property a getter/setter (in columnProperties.js), though doable, might present performance concerns as this property is possibly the most accessed of all column properties.
     * @param color
     */
    setBackgroundColor: function(color) {
        if (this.properties.backgroundColor !== color) {
            this.properties.backgroundColor = color;
            this.behavior.grid.renderer.rebundleGridRenderers();
        }
    },

    addProperties: function(properties) {
        var key, descriptor, obj = this.properties;

        for (key in properties) {
            if (properties.hasOwnProperty(key)) {
                descriptor = Object.getOwnPropertyDescriptor(obj, key);
                if (!descriptor || descriptor.writable || descriptor.set) {
                    obj[key] = properties[key];
                }
            }
        }
    },

    /**
     * @summary Get a new cell editor.
     * @desc The cell editor to use must be registered with the key in the cell's `editor` property.
     *
     * The cell's `format` property is mixed into the provided cellEvent for possible overriding by developer's override of {@link DataModel.prototype.getCellEditorAt} before being used by {@link CellEditor} to parse and format the cell value.
     *
     * @param {CellEvent} cellEvent
     *
     * @returns {undefined|CellEditor} Falsy value means either no declared cell editor _or_ instantiation aborted by falsy return from `fireRequestCellEdit`.
     */
    getCellEditorAt: function(cellEvent) {
        var columnIndex = this.index,
            rowIndex = cellEvent.gridCell.y,
            editorName = cellEvent.properties.editor,
            options = Object.create(cellEvent, {
                format: {
                    // `options.format` is a copy of the cell's `format` property which is:
                    // 1. Subject to adjustment by the `getCellEditorAt` override.
                    // 2. Then used by the cell editor to reference the predefined localizer.
                    writable: true,
                    enumerable: true, // so cell editor will copy it to self
                    value: cellEvent.properties.format
                }
            }),
            cellEditor = this.dataModel.getCellEditorAt(columnIndex, rowIndex, editorName, options);

        if (cellEditor && !cellEditor.grid) {
            // cell editor returned but not fully instantiated (aborted by falsy return from fireRequestCellEdit)
            cellEditor = undefined;
        }

        return cellEditor;
    },

    getFormatter: function() {
        var localizerName = this.properties.format;
        return this.behavior.grid.localization.get(localizerName).format;
    }
};

Column.prototype.mixIn(require('./cellProperties').mixin);
Column.prototype.mixIn(require('./columnProperties').mixin);

module.exports = Column;

},{"../../images":11,"../lib/error":86,"./cellProperties":35,"./columnProperties":37,"overrider":20}],34:[function(require,module,exports){
'use strict';

var Behavior = require('./Behavior');
var columnEnumDecorators = require('./columnEnumDecorators');
var DataModelJSON = require('../dataModels/JSON');

/**
 * > This constructor (actually {@link behaviors.JSON#initialize}) will be called upon instantiation of this class or of any class that extends from this class. See {@link https://github.com/joneit/extend-me|extend-me} for more info.
 * @name behaviors.JSON
 * @constructor
 * @extends Behavior
 */
var JSON = Behavior.extend('behaviors.JSON', {

    preInitialize: function(grid, options) {
        this.columnEnum = {};
    },

    initialize: function(grid, options) {
        this.setData(options);
    },

    createColumns: function() {
        Behavior.prototype.createColumns.call(this);

        var columnEnum = this.columnEnum;

        Object.keys(columnEnum).forEach(function(propName) {
            delete columnEnum[propName];
        });

        this.dataModel.schema.forEach(function(columnSchema, index) {
            this.addColumn({
                index: index,
                header: columnSchema.header,
                calculator: columnSchema.calculator
            });

            columnEnum[this.columnEnumKey(columnSchema.name)] = index;
        }, this);
    },

    /**
     * @summary Style enum keys.
     * @desc Override this method to style your keys to your liking.
     * @see {@columnEnumDecorators} or roll your own
     * @param key
     * @returns {string}
     * @memberOf behaviors.JSON.prototype
     */
    columnEnumKey: columnEnumDecorators.toAllCaps,

    getNewDataModel: function(options) {
        return new DataModelJSON(this.grid, options);
    },

    /**
     * @memberOf behaviors.JSON.prototype
     * @description Set the header labels.
     * @param {string[]|object} headers - The header labels. One of:
     * * _If an array:_ Must contain all headers in column order.
     * * _If a hash:_ May contain any headers, keyed by field name, in any order.
     */
    setHeaders: function(headers) {
        if (headers instanceof Array) {
            // Reset all headers
            var allColumns = this.allColumns;
            headers.forEach(function(header, index) {
                allColumns[index].header = header; // setter updates header in both column and data source objects
            });
        } else if (typeof headers === 'object') {
            // Adjust just the headers in the hash
            this.allColumns.forEach(function(column) {
                if (headers[column.name]) {
                    column.header = headers[column.name];
                }
            });
        }
    },

    /**
     * @memberOf behaviors.JSON.prototype
     * @summary Set grid data.
     * @desc Exits without doing anything if:
     * * `dataRows` undefined; or
     * * `dataRows` omitted and `options.data` undefined
     * @param {function|object[]} [dataRows=options.data] - Array of uniform data row objects or function returning same.
     * Passed as 1st param to {@link dataModel.JSON#setData}.
     * @param {object} [options] - Takes first argument position when `dataRows` omitted.
     * @param {function|object} [options.data] - Array of uniform data row objects or function returning same.
     * Only used when `dataRows` was omitted.
     * @param {function|object} [options.schema] - Array of column schema objects or function returning same.
     * Passed as 2nd param to {@link dataModel.JSON#setData}.
     * @param {boolean} [options.apply=true] Apply data transformations to the new data.
     */
    setData: function(dataRows, options) {
        if (!(Array.isArray(dataRows) || typeof dataRows === 'function')) {
            options = dataRows;
            dataRows = options && options.data;
        }

        dataRows = this.unwrap(dataRows);

        if (dataRows === undefined) {
            return;
        }

        if (!Array.isArray(dataRows)) {
            throw 'Expected data to be an array (of data row objects).';
        }

        options = options || {};

        var grid = this.grid,
            schema = this.unwrap(options.schema), // *always* define a new schema on reset
            schemaChanged = schema || !this.subgrids.lookup.data.getColumnCount(), // schema will change if a new schema was provided OR data model has an empty schema now, which triggers schema generation on setData below
            reindex = options.apply === undefined || options.apply; // defaults to true

        // Inform interested data models of data.
        this.subgrids.forEach(function(dataModel) {
            if (dataModel.setData && !dataModel.hasOwnData) {
                dataModel.setData(dataRows, schema);
            }
        });

        if (grid.cellEditor) {
            grid.cellEditor.cancelEditing();
        }

        if (reindex) {
            this.reindex();
        }

        if (schemaChanged) {
            this.createColumns();
        }

        grid.allowEvents(this.getRowCount());
    },

    //Not being used. Should be repurposed??
    setDataProvider: function(dataProvider) {
        this.dataModel.setDataProvider(dataProvider);
    },

    hasTreeColumn: function() {
        return this.grid.properties.showTreeColumn && this.dataModel.isTree();
    },

    getSelections: function() {
        return this.grid.selectionModel.getSelections();
    }
});


JSON.columnEnumDecorators = columnEnumDecorators;

module.exports = JSON;

},{"../dataModels/JSON":59,"./Behavior":32,"./columnEnumDecorators":36}],35:[function(require,module,exports){
'use strict';

/**
 * Column.js mixes this module into its prototype.
 * @mixin
 */
exports.mixin = {

    /**
     * @summary Get the properties object for cell.
     * @desc This is the cell's own properties object if found; else the column object.
     *
     * If you are seeking a single specific property, consider calling {@link Column#getCellProperty} instead (which calls this method).
     * @param {number} rowIndex - Data row coordinate.
     * @return {object} The properties of the cell at x,y in the grid.
     * @memberOf Column#
     */
    getCellProperties: function(rowIndex, dataModel) {
        return this.getCellOwnProperties(rowIndex, dataModel) || this.properties;
    },

    /**
     * @param {number} rowIndex - Data row coordinate.
     * @param {object} properties - Hash of cell properties.
     * @returns {*}
     * @memberOf Column#
     */
    setCellProperties: function(rowIndex, properties, dataModel) {
        return Object.assign(newCellPropertiesObject.call(this, rowIndex, dataModel), properties);
    },

    /**
     * @param {number} rowIndex - Data row coordinate.
     * @param {object} properties - Hash of cell properties.
     * @returns {object} Cell's own properties object, which will be created by this call if it did not already exist.
     * @memberOf Column#
     */
    addCellProperties: function(rowIndex, properties, dataModel) {
        return Object.assign(getCellPropertiesObject.call(this, rowIndex, dataModel), properties);
    },

    /**
     * @summary Get the cell's own properties object.
     * @desc Due to memory constraints, we don't create a cell properties object for every cell.
     *
     * If the cell has its own properties object, it:
     * * was created by a previous call to `setCellProperties` or `setCellProperty`
     * * has the column properties object as its prototype
     * * is returned
     *
     * If the cell does not have its own properties object, this method returns `null`.
     *
     * Call this method only when you need to know if the the cell has its own properties object; otherwise call {@link Column#getCellProperties|getCellProperties}.
     * @param {number} rowIndex - Data row coordinate.
     * @returns {null|object} The "own" properties of the cell at x,y in the grid. If the cell does not own a properties object, returns `null`.
     * @memberOf Column#
     */
    getCellOwnProperties: function(rowIndex, dataModel) {
        var metadata;
        return (
            // this.index >= 0 && // no cell props on row handle cells
            (metadata = (dataModel || this.dataModel).getRowMetadata(rowIndex)) && // no cell props on non-existent rows
            metadata && metadata[this.name] ||
            null // null means not previously created
        );
    },

    deleteCellOwnProperties: function(rowIndex, dataModel) {
        dataModel = dataModel || this.dataModel;
        var metadata = dataModel.getRowMetadata(rowIndex);
        if (metadata) {
            delete metadata[this.name];
            if (Object.keys(metadata).length === 0) {
                dataModel.setRowMetadata(rowIndex);
            }
        }
    },

    /**
     * @summary Return a specific cell property.
     * @desc If there is no cell properties object, defers to column properties object.
     * @param {number} rowIndex - Data row coordinate.
     * @param {string} key
     * @return {object} The specified property for the cell at x,y in the grid.
     * @memberOf Column#
     */
    getCellProperty: function(rowIndex, key, dataModel) {
        return this.getCellProperties(rowIndex, dataModel)[key];
    },

    /**
     * @param {number} rowIndex - Data row coordinate.
     * @param {string} key
     * @param value
     * @returns {object} Cell's own properties object, which will be created by this call if it did not already exist.
     * @memberOf Column#
     */
    setCellProperty: function(rowIndex, key, value, dataModel) {
        var cellProps = getCellPropertiesObject.call(this, rowIndex, dataModel);
        cellProps[key] = value;
        return cellProps;
    },

    deleteCellProperty: function(rowIndex, key, dataModel) {
        var cellProps = this.getCellOwnProperties(rowIndex, dataModel);
        if (cellProps) {
            delete cellProps[key];
        }
    },

    /**
     * Clear all cell properties from all cells in this column.
     * @memberOf Column#
     */
    clearAllCellProperties: function() {
        this.behavior.subgrids.forEach(function(dataModel) {
            for (var y = dataModel.getRowCount(); y--;) {
                this.deleteCellOwnProperties(y, dataModel);
            }
        }, this);
    }
};

/**
 * @todo: Theoretically setData should call this method to ensure each cell's persisted properties object is properly recreated with prototype set to its column's properties object.
 * @this {Column}
 * @param {number} rowIndex - Data row coordinate.
 * @returns {object}
 * @private
 */
function getCellPropertiesObject(rowIndex, dataModel) {
    return this.getCellOwnProperties(rowIndex, dataModel) || newCellPropertiesObject.call(this, rowIndex, dataModel);
}

/**
 * @this {Column}
 * @param {number} rowIndex - Data row coordinate.
 * @returns {object}
 * @private
 */
function newCellPropertiesObject(rowIndex, dataModel) {
    var metadata = (dataModel || this.dataModel).getRowMetadata(rowIndex, {}),
        props = this.properties;

    switch (this._index) {
        case this.behavior.treeColumnIndex:
            props = this.properties.treeHeader;
            break;
        case this.behavior.rowColumnIndex:
            props = this.properties.rowHeader;
            break;
    }

    return (metadata[this.name] = Object.create(props));
}

},{}],36:[function(require,module,exports){
'use strict';


var REGEX_CAMEL_CASE = /([^_A-Z])([A-Z]+)/g; // all instances of xX or _X within a "word"

var columnEnumDecorators = {
    passThrough: function(key) {
        // pass through as is
        return key;
    },

    toAllCaps: function(key) {
        // convert camel case to underscore separated words
        return key.replace(REGEX_CAMEL_CASE, '$1_$2').toUpperCase();
    },

    toCamelCase: function(key) {
        // only convert keys without initial underscores
        if (key[0] !== '_') {
            // if all caps, make lower case
            if (!/[a-z]/.test(key)) {
                key = key.toLowerCase();
            }

            // convert all instances of underscores + char to uppercase char (without underscore)
            key = key.replace(/_([a-z])/ig, function(match, char) {
                return char.toUpperCase();
            });
        }

        return key;
    }
};


module.exports = columnEnumDecorators;

},{}],37:[function(require,module,exports){
'use strict';

var toFunction = require('../lib/toFunction');

var COLUMN_ONLY_PROPERTY = 'Attempt to set column-only property on a non-column properties object.';

/**
 * @this {Column}
 * @returns {object}
 * @memberOf Column#
 */
function createColumnProperties() {
    var column = this,
        tableState = column.behavior.grid.properties,
        properties;

    properties = Object.create(tableState, {

        index: { // read-only (no setter)
            get: function() {
                return column.index;
            }
        },

        name: { // read-only (no setter)
           get: function() {
                return column.name;
            }
        },

        field: { // read-only (no setter)
            get: function() {
                return column.name;
            }
        },

        columnName: { // read-only (no setter)
            get: function() {
                return column.name;
            }
        },

        header: {
            get: function() {
                return column.header;
            },
            set: function(header) {
                if (this !== column.properties) {
                    throw new column.HypergridError(COLUMN_ONLY_PROPERTY);
                }
                column.header = header;
            }
        },

        type: {
            get: function() {
                return column.type;
            },
            set: function(type) {
                if (this !== column.properties) {
                    throw new column.HypergridError(COLUMN_ONLY_PROPERTY);
                }
                column.type = type;
            }
        },

        calculator: {
            get: function() {
                return column.calculator;
            },
            set: function(calculator) {
                if (this !== column.properties) {
                    throw new column.HypergridError(COLUMN_ONLY_PROPERTY);
                }

                if (!calculator) {
                    column.calculator = undefined;
                    return;
                }

                if (typeof calculator === 'function') {
                    calculator = calculator.toString();
                } else if (typeof calculator !== 'string') {
                    throw new this.grid.HypergridError('Expected function or string containing function or function name.');
                }

                var matches, key = calculator,
                    calculators = this.grid.properties.calculators = this.grid.properties.calculators || {};

                if (/^\w+$/.test(calculator)) { // just a function name?
                    calculator = calculators[calculator];
                } else {
                    matches = calculator.match(/^function\s*(\w+)\(/);
                    if (matches) {
                        key = matches[1];
                    }
                }

                column.calculator = calculators[key] = typeof calculators[key] === 'function'
                    ? calculators[key] || key //null calculators use the key itself (anonymous functions)
                    : toFunction(calculator);
            }
        },

        toJSON: {
            // although we don't generally want header, type, and calculator to be enumerable, we do want them to be serializable
            value: function() {
                return Object.assign({
                    header: this.header,
                    type: this.type,
                    calculator: this.calculator
                }, this);
            }
        }

    });

    Object.defineProperties(properties, {
        rowHeader: { value: Object.create(properties, createColumnProperties.rowHeaderDescriptors) },
        treeHeader: { value: Object.create(properties, createColumnProperties.treeHeaderDescriptors) },
        columnHeader: { value: Object.create(properties, createColumnProperties.columnHeaderDescriptors) },
        filterProperties: { value: Object.create(properties, createColumnProperties.filterDescriptors) }
    });

    return properties;
}

createColumnProperties.treeHeaderDescriptors = {
    font: {
        configurable: true,
        enumerable: true,
        get: function() {
            return this.treeHeaderFont;
        },
        set: function(value) {
            this.treeHeaderFont = value;
        }
    },
    color: {
        configurable: true,
        enumerable: true,
        get: function() {
            return this.treeHeaderColor;
        },
        set: function(value) {
            this.treeHeaderColor = value;
        }
    },
    backgroundColor: {
        configurable: true,
        enumerable: true,
        get: function() {
            return this.treeHeaderBackgroundColor;
        },
        set: function(value) {
            this.treeHeaderBackgroundColor = value;
        }
    },
    foregroundSelectionFont: {
        configurable: true,
        enumerable: true,
        get: function() {
            return this.treeHeaderForegroundSelectionFont;
        },
        set: function(value) {
            this.treeHeaderForegroundSelectionFont = value;
        }
    },
    foregroundSelectionColor: {
        configurable: true,
        enumerable: true,
        get: function() {
            return this.treeHeaderForegroundSelectionColor;
        },
        set: function(value) {
            this.treeHeaderForegroundSelectionColor = value;
        }
    },
    renderer: {
        configurable: true,
        enumerable: true,
        get: function() {
            return this.treeRenderer;
        },
        set: function(value) {
            this.treeRenderer = value;
        }
    },
    backgroundSelectionColor: {
        configurable: true,
        enumerable: true,
        get: function() {
            return this.treeHeaderBackgroundSelectionColor;
        },
        set: function(value) {
            this.treeHeaderBackgroundSelectionColor = value;
        }
    }
    //leftIcon: undefined
};

createColumnProperties.rowHeaderDescriptors = {
    font: {
        configurable: true,
        enumerable: true,
        get: function() {
            return this.rowHeaderFont;
        },
        set: function(value) {
            this.rowHeaderFont = value;
        }
    },
    color: {
        configurable: true,
        enumerable: true,
        get: function() {
            return this.rowHeaderColor;
        },
        set: function(value) {
            this.rowHeaderColor = value;
        }
    },
    backgroundColor: {
        configurable: true,
        enumerable: true,
        get: function() {
            return this.rowHeaderBackgroundColor;
        },
        set: function(value) {
            this.rowHeaderBackgroundColor = value;
        }
    },
    foregroundSelectionFont: {
        configurable: true,
        enumerable: true,
        get: function() {
            return this.rowHeaderForegroundSelectionFont;
        },
        set: function(value) {
            this.rowHeaderForegroundSelectionFont = value;
        }
    },
    foregroundSelectionColor: {
        configurable: true,
        enumerable: true,
        get: function() {
            return this.rowHeaderForegroundSelectionColor;
        },
        set: function(value) {
            this.rowHeaderForegroundSelectionColor = value;
        }
    },
    backgroundSelectionColor: {
        configurable: true,
        enumerable: true,
        get: function() {
            return this.rowHeaderBackgroundSelectionColor;
        },
        set: function(value) {
            this.rowHeaderBackgroundSelectionColor = value;
        }
    },
    leftIcon: {
        configurable: true,
        enumerable: true,
        get: function() {
            if (this.grid.properties.rowHeaderCheckboxes) {
                var result;
                if (this.isDataRow) {
                    result = this.isRowSelected ? 'checked' : 'unchecked';
                } else if (this.isHeaderRow) {
                    result = this.allRowsSelected ? 'checked' : 'unchecked';
                } else if (this.isFilterRow) {
                    result = 'filter-off';
                }
                return result;
            }
        },
        set: function(value) {
            // replace self with a simple instance var
            Object.defineProperty(this, 'leftIcon', {
                configurable: true,
                enumerable: true,
                writable: true,
                value: value
            });
        }
    }
};

createColumnProperties.filterDescriptors = {
    font: {
        configurable: true,
        enumerable: true,
        get: function() {
            return this.filterFont;
        },
        set: function(value) {
            this.filterFont = value;
        }
    },
    color: {
        configurable: true,
        enumerable: true,
        get: function() {
            return this.filterColor;
        },
        set: function(value) {
            this.filterColor = value;
        }
    },
    backgroundColor: {
        configurable: true,
        enumerable: true,
        get: function() {
            return this.filterBackgroundColor;
        },
        set: function(value) {
            this.filterBackgroundColor = value;
        }
    },
    foregroundSelectionColor: {
        configurable: true,
        enumerable: true,
        get: function() {
            return this.filterForegroundSelectionColor;
        },
        set: function(value) {
            this.filterForegroundSelectionColor = value;
        }
    },
    backgroundSelectionColor: {
        configurable: true,
        enumerable: true,
        get: function() {
            return this.filterBackgroundSelectionColor;
        },
        set: function(value) {
            this.filterBackgroundSelectionColor = value;
        }
    },
    halign: {
        configurable: true,
        enumerable: true,
        get: function() {
            return this.filterHalign;
        },
        set: function(value) {
            this.filterHalign = value;
        }
    },
    renderer: {
        configurable: true,
        enumerable: true,
        get: function() {
            return this.filterRenderer;
        },
        set: function(value) {
            this.filterRenderer = value;
        }
    },
    rightIcon: {
        configurable: true,
        enumerable: true,
        get: function() {
            var result;
            if (this.filterable) {
                result = this.value.length ? 'filter-on' : 'filter-off';
            }
            return result;
        },
        set: function(value) {
            // replace self with a simple instance var
            Object.defineProperty(this, 'rightIcon', {
                configurable: true,
                enumerable: true,
                writable: true,
                value: value
            });
        }
    }
};

createColumnProperties.columnHeaderDescriptors = {
    font: {
        configurable: true,
        enumerable: true,
        get: function() {
            return this.columnHeaderFont;
        },
        set: function(value) {
            this.columnHeaderFont = value;
        }
    },
    color: {
        configurable: true,
        enumerable: true,
        get: function() {
            return this.columnHeaderColor;
        },
        set: function(value) {
            this.columnHeaderColor = value;
        }
    },
    backgroundColor: {
        configurable: true,
        enumerable: true,
        get: function() {
            return this.columnHeaderBackgroundColor;
        },
        set: function(value) {
            this.columnHeaderBackgroundColor = value;
        }
    },
    foregroundSelectionFont: {
        configurable: true,
        enumerable: true,
        get: function() {
            return this.columnHeaderForegroundSelectionFont;
        },
        set: function(value) {
            this.columnHeaderForegroundSelectionFont = value;
        }
    },
    foregroundSelectionColor: {
        configurable: true,
        enumerable: true,
        get: function() {
            return this.columnHeaderForegroundSelectionColor;
        },
        set: function(value) {
            this.columnHeaderForegroundSelectionColor = value;
        }
    },
    backgroundSelectionColor: {
        configurable: true,
        enumerable: true,
        get: function() {
            return this.columnHeaderBackgroundSelectionColor;
        },
        set: function(value) {
            this.columnHeaderBackgroundSelectionColor = value;
        }
    },
    halign: {
        configurable: true,
        enumerable: true,
        get: function() {
            return this.columnHeaderHalign;
        },
        set: function(value) {
            this.columnHeaderHalign = value;
        }
    },
    renderer: {
        configurable: true,
        enumerable: true,
        get: function() {
            return this.columnHeaderRenderer;
        },
        set: function(value) {
            this.columnHeaderRenderer = value;
        }
    },
    leftIcon: { writable: true, value: undefined},
    centerIcon: { writable: true, value: undefined},
    rightIcon: { writable: true, value: undefined},
};

/**
 * Column.js mixes this module into its prototype.
 * @mixin
 */
exports.mixin = {
    createColumnProperties: createColumnProperties
};

},{"../lib/toFunction":89}],38:[function(require,module,exports){
'use strict';

var dataModels = require('../dataModels');

/** @typedef subgridConstructorRef
 * @summary Type definition.
 * @desc One of:
 * * **`function` type** - Assumed to already be a data model constructor.
 * * **`string` type** - The name of a data model "class" (constructor) registered in the {@link src/dataModels} namespace. Used to look up the constructor in the namespace.
 */

/** @typedef subgridSpec
 * @summary Type definition.
 * @desc One of:
 * * **`object` type** _(except when an array)_ - Assumed to be a reference to an already-instantiated data model. Used as is.
 * * **`'data'` special value** - Set to the data subgrid (_i.e.,_ the behavior's already-instantiated data model).
 * * **{@link subgridConstructorRef}** _(see)_ - The constructor ref is resolved and called with the `new` keyword + a reference to the grid as the sole parameter.
 * * **`Array` object** — Accommodates data model constructor arguments. The constructor ref is resolved and called with the `new` keyword + a reference to the grid as the first parameter + the remaining elements as additional parameters. (If you don't have remaining elements, don't give an array here; just provide a simple `subgridConstructorRef` instead.) The array should have two or more elements:
 *   * The first element is a {@link subgridConstructorRef}.
 *   * Remaining elements are used as additional parameters to the constructor.
 */

/**
 * Behavior.js mixes this module into its prototype.
 * @mixin
 */
exports.mixin = {
    /**
     * An array where each element represents a subgrid to be rendered in the hypergrid.
     *
     * The list should always include at least one "data" subgrid, typically {@link Behavior#dataModel|dataModel}.
     * It may also include zero or more other types of subgrids such as header, filter, and summary subgrids.
     *
     * This object also sports a dictionary of subgrids in `lookup` property where each dictionary key is one of:
     * * **`subgrid.name`** (for those that have a defined name, which is presumed to be unique)
     * * **`subgrid.type`** (not unique, so if you plan on having multiple, name them!)
     * * **`'data'`** for the (one and only) data subgrid when unnamed (note that data subgrids have no `type`)
     *
     * The setter:
     * * "Enlivens" any constructors (see {@link Behavior~createSubgrid|createSubgrid} for details).
     * * Reconstructs the dictionary.
     * * Calls {@link Behavior#shapeChanged|shapeChanged()}.
     *
     * @param {subgridSpec[]} subgridSpecs
     *
     * @type {dataModelAPI[]}
     *
     * @memberOf Behavior#
     */
    set subgrids(subgridSpecs) {
        var subgrids = this._subgrids = [];

        subgrids.lookup = {};

        subgridSpecs.forEach(function(spec) {
            if (spec) {
                subgrids.push(this.createSubgrid(spec));
            }
        }, this);

        this.shapeChanged();
    },
    get subgrids() {
        return this._subgrids;
    },

    /**
     * @summary Maps a `subgridSpec` to a data model.
     * @desc The spec may describe either an existing data model, or a constructor for a new data model.
     * @param {subgridSpec} spec
     * @returns {dataModelAPI} A data model.
     * @memberOf Behavior#
     */
    createSubgrid: function(spec, args) {
        var subgrid, Constructor, variableArgArray;

        if (spec === 'data') {
            subgrid = this.dataModel;
        } else if (spec instanceof Array && spec.length) {
            Constructor = derefSubgridRef.call(this, spec[0]);
            variableArgArray = spec.slice(1);
            subgrid = this.createApply(Constructor, variableArgArray, this.grid);
        } else if (typeof spec === 'object') {
            subgrid = spec;
        } else {
            Constructor = derefSubgridRef.call(this, spec);
            variableArgArray = Array.prototype.slice.call(arguments, 1);
            subgrid = this.createApply(Constructor, variableArgArray, this.grid);
        }

        // undefined type is data
        subgrid.type = subgrid.type || 'data';

        // make dictionary lookup entry
        var key = subgrid.name || subgrid.type;
        this._subgrids.lookup[key] = this._subgrids.lookup[key] || subgrid; // only save first with this key

        // make isType boolean
        subgrid['is' + subgrid.type[0].toUpperCase() + subgrid.type.substr(1)] = true;

        return subgrid;
    },

    /**
     * @summary Gets the number of "header rows".
     * @desc Defined as the sum of all rows of all subgrids before the (first) data subgrid.
     * @memberOf behaviors.JSON.prototype
     */
    getHeaderRowCount: function() {
        var result = 0;

        this.subgrids.find(function(subgrid) {
            if (subgrid.isData) {
                return true; // stop
            }
            result += subgrid.getRowCount();
        });

        return result;
    }
};

/**
 * @summary Resolves a subgrid constructor reference.
 * @desc The ref is resolved to a data model constructor.
 * @this {Behavior}
 * @param {subgridConstructorRef} ref
 * @returns {DataModel} A data model constructor.
 * @memberOf Behavior~
 */
function derefSubgridRef(ref) {
    var Constructor;
    switch (typeof ref) {
        case 'string':
            Constructor = dataModels[ref];
            break;
        case 'function':
            Constructor = ref;
            break;
        default:
            throw new this.HypergridError('Expected subgrid ref to be registered name or constructor, but found ' + typeof ref + '.');
    }
    return Constructor;
}

},{"../dataModels":60}],39:[function(require,module,exports){
/* eslint-env browser */

'use strict';

var mustache = require('mustache');

var Base = require('../Base');
var effects = require('../lib/DOM/effects');
var Localization = require('../lib/Localization');

/**
 * @constructor
 */
var CellEditor = Base.extend('CellEditor', {

    /**
     * @param grid
     * @param {CellEvent} options - Properties listed below + arbitrary mustache "variables" for merging into template.
     * @param {Point} options.editPoint - Deprecated; use `options.gridCell`.
     * @param {string} [options.format] - Name of a localizer with which to override prototype's `localizer` property.
     */
    initialize: function(grid, options) {
        // Mix in all enumerable properties for mustache use, typically `column` and `format`.
        for (var key in options) {
            this[key] = options[key];
        }

        this.event = options;

        var value = grid.behavior.getValue(this.event);
        if (value instanceof Array) {
            value = value[1]; //it's a nested object
        }

        /**
         * my instance of hypergrid
         * @type {Hypergrid}
         * @memberOf CellEditor.prototype
         */
        this.grid = grid;

        this.grid.cellEditor = this;

        this.locale = grid.localization.locale; // for template's `lang` attribute

        // override native localizer with localizer named in format if defined (from instantiation options)
        if (options.format) {
            this.localizer = this.grid.localization.get(options.format);
        }

        this.initialValue = value;

        var container = document.createElement('DIV');
        container.innerHTML = mustache.render(this.template, this);

        /**
         * This object's input control, one of:
         * * *input element* - an `HTMLElement` that has a `value` attribute, such as `HTMLInputElement`, `HTMLButtonElement`, etc.
         * * *container element* - an `HTMLElement` containing one or more input elements, only one of which contains the editor value.
         *
         * For access to the input control itself (which may or may not be the same as `this.el`), see `this.input`.
         *
         * @type {HTMLElement}
         * @default null
         * @memberOf CellEditor.prototype
         */
        this.el = container.firstChild;

        this.input = this.el;

        this.errors = 0;

        var self = this;
        this.el.addEventListener('keyup', this.keyup.bind(this));
        this.el.addEventListener('keydown', function(e) {
            if (e.keyCode === 9) {
                // prevent TAB from leaving input control
                e.preventDefault();
            }
            grid.fireSyntheticEditorKeyDownEvent(self, e);
        });
        this.el.addEventListener('keypress', function(e) {
            grid.fireSyntheticEditorKeyPressEvent(self, e);
        });
        this.el.addEventListener('mousedown', function(e) {
            self.onmousedown(e);
        });
    },

    // If you override this method, be sure to call it as a final step (or call stopPropagation yourself).
    onmousedown: function(event) {
        event.stopPropagation(); // Catch mousedown here before it gets to the document listener defined in Hypergrid().
    },

    localizer: Localization.prototype.null,

    specialKeyups: {
        //0x08: 'clearStopEditing', // backspace
        0x09: 'stopEditing', // tab
        0x0d: 'stopEditing', // return/enter
        0x1b: 'cancelEditing' // escape
    },

    keyup: function(e) {
        var grid = this.grid,
            cellProps = this.event.properties,
            feedbackCount = cellProps.feedbackCount,
            keyChar = grid.canvas.getKeyChar(e),
            specialKeyup,
            stopped;

        // STEP 1: Call the special key handler as needed
        if (
            (specialKeyup = this.specialKeyups[e.keyCode]) &&
            (stopped = this[specialKeyup](feedbackCount))
        ) {
            grid.repaint();
        }

        // STEP 2: If this is a possible "nav key" consumable by CellSelection#handleKeyDown, try to stop editing and send it along
        if (cellProps.mappedNavKey(keyChar, e.ctrlKey)) {
            if (
                !specialKeyup &&
                // We didn't try to stop editing above so try to stop it now
                (stopped = this.stopEditing(feedbackCount))
            ) {
                grid.repaint();
            }

            if (stopped) {
                // Editing successfully stopped
                // -> send the event down the feature chain
                var finEvent = grid.canvas.newEvent(e, 'fin-editor-keydown', {
                    grid: grid,
                    alt: e.altKey,
                    ctrl: e.ctrlKey,
                    char: keyChar,
                    code: e.charCode,
                    key: e.keyCode,
                    meta: e.metaKey,
                    shift: e.shiftKey,
                    identifier: e.key,
                    editor: this
                });
                grid.delegateKeyDown(finEvent);
            }
        }

        this.grid.fireSyntheticEditorKeyUpEvent(this, e);

        return stopped;
    },

    /**
     * if true, check that the editor is in the right location
     * @type {boolean}
     * @default false
     * @memberOf CellEditor.prototype
     */
    checkEditorPositionFlag: false,

    /**
     * @memberOf CellEditor.prototype
     * @desc This function is a callback from the fin-hypergrid.   It is called after each paint of the canvas.
     */
    gridRenderedNotification: function() {
        this.checkEditor();
    },

    /**
     * @memberOf CellEditor.prototype
     * @desc scroll values have changed, we've been notified
     */
    scrollValueChangedNotification: function() {
        this.checkEditorPositionFlag = true;
    },

    /**
     * @memberOf CellEditor.prototype
     * @desc move the editor to the current editor point
     */
    moveEditor: function() {
        this.setBounds(this.event.bounds);
    },

    beginEditing: function() {
        if (this.grid.fireRequestCellEdit(this.event, this.initialValue)) {
            this.checkEditorPositionFlag = true;
            this.checkEditor();
        }
    },

    /**
     * @summary Put the value into our editor.
     * @desc Formats the value and displays it.
     * The localizer's {@link localizerInterface#format|format} method will be called.
     *
     * Override this method if your editor has additional or alternative GUI elements.
     *
     * @param {object} value - The raw unformatted value from the data source that we want to edit.
     * @memberOf CellEditor.prototype
     */
    setEditorValue: function(value) {
        this.input.value = this.localizer.format(value);
    },

    /**
     * @memberOf CellEditor.prototype
     * @desc display the editor
     */
    showEditor: function() {
        this.el.style.display = 'inline';
    },

    /**
     * @memberOf CellEditor.prototype
     * @desc hide the editor
     */
    hideEditor: function() {
        this.el.style.display = 'none';
    },

    /** @summary Stops editing.
     * @desc Before saving, validates the edited value in two phases as follows:
     * 1. Call `validateEditorValue`. (Calls the localizer's `invalid()` function, if available.)
     * 2. Catch any errors thrown by the {@link CellEditor#getEditorValue|getEditorValue} method.
     *
     * **If the edited value passes both phases of the validation:**
     * Saves the edited value by calling the {@link CellEditor#saveEditorValue|saveEditorValue} method.
     *
     * **On validation failure:**
     * 1. If `feedback` was omitted, cancels editing, discarding the edited value.
     * 2. If `feedback` was provided, gives the user some feedback (see `feedback`, below).
     *
     * @param {number} [feedback] What to do on validation failure. One of:
     * * **`undefined`** - Do not show the error effect or the end effect. Just discard the value and close the editor (as if `ESC` had been typed).
     * * **`0`** - Just shows the error effect (see the {@link CellEditor#errorEffect|errorEffect} property).
     * * **`1`** - Shows the error feedback effect followed by the detailed explanation.
     * * `2` or more:
     *   1. Shows the error feedback effect
     *   2. On every `feedback` tries, shows the detailed explanation.
     * * If `undefined` (omitted), simply cancels editing without saving edited value.
     * * If 0, shows the error feedback effect (see the {@link CellEditor#errorEffect|errorEffect} property).
     * * If > 0, shows the error feedback effect _and_ calls the {@link CellEditor#errorEffectEnd|errorEffectEnd} method) every `feedback` call(s) to `stopEditing`.
     * @returns {boolean} Truthy means successful stop. Falsy means syntax error prevented stop. Note that editing is canceled when no feedback requested and successful stop includes (successful) cancel.
     * @memberOf CellEditor.prototype
     */
    stopEditing: function(feedback) {
        /**
         * @type {boolean|string|Error}
         */
        var error = this.validateEditorValue();

        if (!error) {
            try {
                var value = this.getEditorValue();
            } catch (err) {
                error = err;
            }
        }

        if (!error && this.grid.fireSyntheticEditorDataChangeEvent(this, this.initialValue, value)) {
            try {
                this.saveEditorValue(value);
            } catch (err) {
                error = err;
            }
        }

        if (!error) {
            this.hideEditor();
            this.grid.cellEditor = null;
            this.el.remove();
        } else if (feedback >= 0) { // false when `feedback` undefined
            this.errorEffectBegin(++this.errors % feedback === 0 && error);
        } else { // invalid but no feedback
            this.cancelEditing();
        }

        return !error;
    },

    /** @summary Cancels editing.
     * @returns {boolean} Successful. (Cancel is always successful.)
     */
    cancelEditing: function() {
        this.setEditorValue(this.initialValue);
        this.hideEditor();
        this.grid.cellEditor = null;
        this.el.remove();

        return true;
    },

    /**
     * Calls the effect function indicated in the {@link module:defaults.feedbackEffect|feedbackEffect} property, which triggers a series of CSS transitions.
     * @param {boolean|string|Error} [error] - If defined, call the {@link CellEditor#errorEffectEnd|errorEffectEnd} method at the end of the last effect transition with this error.
     * @memberOf CellEditor.prototype
     */
    errorEffectBegin: function(error) {
        var spec = this.grid.properties.feedbackEffect, // spec may e a string or an object with name and options props
            options = Object.assign({}, spec.options), // if spec is a string, spec.options will be undefined
            effect = effects[spec.name || spec]; // if spec is a string, spec.name will be undefined

        if (error) {
            options.callback = this.errorEffectEnd.bind(this, error);
        }

        if (effect) {
            effect.call(this, options);
        }
    },

    /**
     * This function expects to be passed an error. There is no point in calling this function if there is no error. Nevertheless, if called with a falsy `error`, returns without doing anything.
     * @this {CellEditor}
     * @param {boolean|string|Error} [error]
     */
    errorEffectEnd: function(error, options) {
        if (error) {
            var msg =
                'Invalid value. To resolve, do one of the following:\n\n' +
                '   * Correct the error and try again.\n' +
                '         - or -\n' +
                '   * Cancel editing by pressing the "esc" (escape) key.';

            error = error.message || error;

            if (typeof error !== 'string') {
                error = '';
            }

            if (this.localizer.expectation) {
                error = error ? error + '\n' + this.localizer.expectation : this.localizer.expectation;
            }

            if (error) {
                if (/[\n\r]/.test(error)) {
                    error = '\n' + error;
                    error = error.replace(/[\n\r]+/g, '\n\n   * ');
                }
                msg += '\n\nAdditional information about this error: ' + error;
            }

            setTimeout(function() { // allow animation to complete
                alert(msg); // eslint-disable-line no-alert
            });
        }
    },

    /**
     * @desc save the new value into the behavior (model)
     * @returns {boolean} Data changed and pre-cell-edit event was not canceled.
     * @memberOf CellEditor.prototype
     */
    saveEditorValue: function(value) {
        var save = (
            !(value && value === this.initialValue) && // data changed
            this.grid.fireBeforeCellEdit(this.event.gridCell, this.initialValue, value, this) // proceed
        );

        if (save) {
            this.grid.behavior.setValue(this.event, value);
            this.grid.fireAfterCellEdit(this.event.gridCell, this.initialValue, value, this);
        }

        return save;
    },

    /**
     * @summary Extract the edited value from the editor.
     * @desc De-format the edited string back into a primitive value.
     *
     * The localizer's {@link localizerInterface#parse|parse} method will be called on the text box contents.
     *
     * Override this method if your editor has additional or alternative GUI elements. The GUI elements will influence the primitive value, either by altering the edited string before it is parsed, or by transforming the parsed value before returning it.
     * @returns {object} the current editor's value
     * @memberOf CellEditor.prototype
     */
    getEditorValue: function() {
        return this.localizer.parse(this.input.value);
    },

    /**
     * If there is no validator on the localizer, returns falsy (not invalid; possibly valid).
     * @returns {boolean|string} Truthy value means invalid. If a string, this will be an error message. If not a string, it merely indicates a generic invalid result.
     */
    validateEditorValue: function() {
        return this.localizer.invalid && this.localizer.invalid(this.input.value);
    },

    /**
     * @summary Request focus for my input control.
     * @desc See GRID-95 "Scrollbar moves inward" for issue and work-around explanation.
     * @memberOf CellEditor.prototype
     */
    takeFocus: function() {
        var el = this.el,
            leftWas = el.style.left,
            topWas = el.style.top;

        el.style.left = el.style.top = 0; // work-around: move to upper left

        var x = window.scrollX, y = window.scrollY;
        this.input.focus();
        window.scrollTo(x, y);
        this.selectAll();

        el.style.left = leftWas;
        el.style.top = topWas;
    },

    /**
     * @memberOf CellEditor.prototype
     * @desc select everything
     */
    selectAll: nullPattern,

    /**
     * @memberOf CellEditor.prototype
     * @desc set the bounds of my input control
     * @param {rectangle} rectangle - the bounds to move to
     */
    setBounds: function(cellBounds) {
        var style = this.el.style;

        style.left = px(cellBounds.x);
        style.top = px(cellBounds.y);
        style.width = px(cellBounds.width);
        style.height = px(cellBounds.height);
    },

    /**
     * @desc check that the editor is in the correct location, and is showing/hidden appropriately
     * @memberOf CellEditor.prototype
     */
    checkEditor: function() {
        if (this.checkEditorPositionFlag) {
            this.checkEditorPositionFlag = false;
            if (this.event.isCellVisible) {
                this.setEditorValue(this.initialValue);
                this.attachEditor();
                this.moveEditor();
                this.showEditor();
                this.takeFocus();
            } else {
                this.hideEditor();
            }
        }
    },

    attachEditor: function() {
        this.grid.div.appendChild(this.el);
    },

    template: ''

});

function nullPattern() {}
function px(n) { return n + 'px'; }


CellEditor.abstract = true; // don't instantiate directly


module.exports = CellEditor;

},{"../Base":25,"../lib/DOM/effects":78,"../lib/Localization":79,"mustache":18}],40:[function(require,module,exports){
'use strict';

var CellEditor = require('./CellEditor');

/**
 * As of spring 2016:
 * Functions well in Chrome and Firefox; unimplemented in Safari.
 * @constructor
 * @extends CellEditor
 */
var Color = CellEditor.extend('Color', {

    template: '<input type="color" lang="{{locale}}" style="{{style}}">'

});

module.exports = Color;

},{"./CellEditor":39}],41:[function(require,module,exports){
/* eslint-env browser */

'use strict';

var CellEditor = require('./CellEditor');

var isChromium = window.chrome,
    winNav = window.navigator,
    vendorName = winNav.vendor,
    isOpera = winNav.userAgent.indexOf('OPR') > -1,
    isIEedge = winNav.userAgent.indexOf('Edge') > -1,
    isIOSChrome = winNav.userAgent.match('CriOS'),
    isChrome = !isIOSChrome &&
        isChromium !== null &&
        isChromium !== undefined &&
        vendorName === 'Google Inc.' &&
        isOpera == false && isIEedge == false; // eslint-disable-line eqeqeq

/**
 * As of spring 2016:
 * Functions well in Chrome except no localization (day, month names; date format).
 * Unimplemented in Safari, Firefox, Internet Explorer.
 * This is a "snmart" control. It detects Chrome:
 * * If Chrome, uses chromeDate overrides format to that required by the value attribute, yyyy-mm-dd. (Note that this is not the format displayed in the control, which is always mm/dd/yyyy.)
 * * Otherwise uses localized date format _but_ falls back to a regular text box.
 * @constructor
 * @extends CellEditor
 */
var Date = CellEditor.extend('Date', {

    initialize: function(grid) {

        var localizerName,
            usesDateInputControl = isChrome;

        if (usesDateInputControl) {
            localizerName = 'chromeDate';
            this.template = '<input type="date">';
        } else {
            localizerName = 'date';
            this.template = '<input type="text" lang="{{locale}}">';

            this.selectAll = function() {
                var lastCharPlusOne = this.getEditorValue().length;
                this.input.setSelectionRange(0, lastCharPlusOne);
            };
        }

        this.localizer = grid.localization.get(localizerName);
    }
});


module.exports = Date;

},{"./CellEditor":39}],42:[function(require,module,exports){
'use strict';

var Textfield = require('./Textfield');

/**
 * Functions well in Chrome, Safari, Firefox, and Internet Explorer.
 * @constructor
 * @extends Textfield
 */
var Number = Textfield.extend('Number', {

    initialize: function(grid) {
        this.localizer = grid.localization.get('number');
    }

});

module.exports = Number;

},{"./Textfield":45}],43:[function(require,module,exports){
'use strict';

var CellEditor = require('./CellEditor');

/**
 * @constructor
 * @extends CellEditor
 */
var Slider = CellEditor.extend('Slider', {

    template: '<input type="range" lang="{{locale}}" style="{{style}}">'

});

module.exports = Slider;

},{"./CellEditor":39}],44:[function(require,module,exports){
'use strict';

var CellEditor = require('./CellEditor');

/**
 * @constructor
 * @extends CellEditor
 */
var Spinner = CellEditor.extend('Spinner', {

    template: '<input type="number" lang="{{locale}}" style="{{style}}">'

});

module.exports = Spinner;

},{"./CellEditor":39}],45:[function(require,module,exports){
'use strict';

var CellEditor = require('./CellEditor');
var Localization = require('../lib/Localization');


/**
 * As of spring 2016:
 * Functions well in Chrome, Safari, Firefox, and Internet Explorer.
 * @constructor
 * @extends CellEditor
 */
var Textfield = CellEditor.extend('Textfield', {

    template: '<input type="text" lang="{{locale}}" class="hypergrid-textfield" style="{{style}}">',

    initialize: function() {
        this.input.style.textAlign = this.event.properties.halign;
    },

    localizer: Localization.prototype.string,

    selectAll: function() {
        this.input.setSelectionRange(0, this.input.value.length);
    }
});

module.exports = Textfield;

},{"../lib/Localization":79,"./CellEditor":39}],46:[function(require,module,exports){
'use strict';

var Registry = require('../lib/Registry');


var warnedBaseClass;

/**
 * @classdesc Registry of cell editor constructors.
 * @param {Hypergrid} options.grid
 * @param {boolean} [options.private=false] - This instance will use a private registry.
 * @constructor
 */
var CellEditors = Registry.extend('CellEditors', {

    BaseClass: require('./CellEditor'), // abstract base class

    items: {}, // shared cell editor registry (when !options.private)

    initialize: function(options) {
        // preregister the standard cell editors
        if (options && options.private || !this.items.celleditor) {
            this.add(require('./Color'));
            this.add(require('./Date'));
            this.add(require('./Number'));
            this.add(require('./Slider'));
            this.add(require('./Spinner'));
            this.add(require('./Textfield'));
        }
    },

    construct: function(Constructor, options) {
        return new Constructor(this.options.grid, options);
    },

    get: function(name) {
        if (name && name.toLowerCase() === 'celleditor') {
            if (!warnedBaseClass) {
                console.warn('grid.cellEditors.get("' + name + '") method call has been deprecated as of v2.1.0 in favor of grid.cellEditors.BaseClass property. (Will be removed in a future release.)');
                warnedBaseClass = true;
            }
            return this.BaseClass;
        }
        return this.super.get.call(this, name);
    }

});

CellEditors.add = Registry.prototype.add.bind(CellEditors);

module.exports = CellEditors;

},{"../lib/Registry":80,"./CellEditor":39,"./Color":40,"./Date":41,"./Number":42,"./Slider":43,"./Spinner":44,"./Textfield":45}],47:[function(require,module,exports){
'use strict';

var CellRenderer = require('./CellRenderer');

/**
 * @constructor
 * @extends CellRenderer
 */
var Button = CellRenderer.extend('Button', {

    /**
     * @summary The default cell rendering function for a button cell.
     * @implements paintFunction
     * @memberOf Button.prototype
     */
    paint: function(gc, config) {
        var val = config.value,
            c = config.dataCell.x,
            r = config.gridCell.y,
            bounds = config.bounds,
            x = bounds.x + 1,
            y = bounds.y + 1,
            width = bounds.width - 1 - config.lineWidth,
            height = bounds.height - 1 - config.lineWidth,
            radius = height / 2,
            arcGradient = gc.createLinearGradient(x, y, x, y + height);

        if (config.mouseDown) {
            arcGradient.addColorStop(0, '#B5CBED');
            arcGradient.addColorStop(1, '#4d74ea');
        } else {
            arcGradient.addColorStop(0, '#ffffff');
            arcGradient.addColorStop(1, '#aaaaaa');
        }

        // draw the background
        gc.cache.fillStyle = config.backgroundColor;
        gc.fillRect(bounds.x, bounds.y, bounds.width, bounds.height);

        // draw the capsule
        gc.cache.fillStyle = arcGradient;
        gc.cache.strokeStyle = '#000000';
        this.roundRect(gc, x, y, width, height, radius, arcGradient, true);

        var ox = (width - gc.getTextWidth(val)) / 2;
        var oy = (height - gc.getTextHeight(gc.cache.font).descent) / 2;

        // draw the text
        gc.cache.textBaseline = 'middle';
        gc.cache.fillStyle = '#333333';
        gc.cache.font = height - 2 + 'px sans-serif';
        config.backgroundColor = 'rgba(0,0,0,0)';
        gc.fillText(val, x + ox, y + oy);

        //identify that we are a button
        config.buttonCells[c + ',' + r] = true;
    }
});

module.exports = Button;



},{"./CellRenderer":48}],48:[function(require,module,exports){
'use strict';

var Base = require('../Base');

/** @typedef paintFunction
 * @type {function}
 * @this {CellEditor}
 * @param {CanvasRenderingContext2D} gc
 * @param {object} config
 * @param {Rectangle} config.bounds - The clipping rect of the cell to be rendered.
 * @param {number} config.x - the "translated" index into the `behavior.allColumns` array
 * @param {number} config.normalizedY - the vertical grid coordinate normalized to first data row
 * @param {number} config.untranslatedX - the horizontal grid coordinate measured from first data column
 * @param {number} config.y - the vertical grid coordinate measured from top header row
 */

/** @constructor
 * @desc Instances of `CellRenderer` are used to render the 2D graphics context within the bound of a cell. Extend this base class to implement your own cell renderer
 *
 *
 * See also {@tutorial cell-renderer}.
 */
var CellRenderer = Base.extend('CellRenderer', {
    /**
     * @desc An empty implementation of a cell renderer, see [the null object pattern](http://c2.com/cgi/wiki?NullObject).
     * @implements paintFunction
     * @memberOf CellRenderer.prototype
     */
    paint: function(gc, config) {},

    /**
     * @desc A simple implementation of rounding a cell.
     * @param {CanvasRenderingContext2D} gc
     * @param {number} x - the x grid coordinate of my origin
     * @param {number} y - the y grid coordinate of my origin
     * @param {number} width - the width I'm allowed to draw within
     * @param {number} height - the height I'm allowed to draw within
     * @param {number} radius
     * @param {number} fill
     * @param {number} stroke
     * @memberOf CellRenderer.prototype
     */
    roundRect: function(gc, x, y, width, height, radius, fill, stroke) {

        if (!stroke) {
            stroke = true;
        }
        if (!radius) {
            radius = 5;
        }
        gc.beginPath();
        gc.moveTo(x + radius, y);
        gc.lineTo(x + width - radius, y);
        gc.quadraticCurveTo(x + width, y, x + width, y + radius);
        gc.lineTo(x + width, y + height - radius);
        gc.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
        gc.lineTo(x + radius, y + height);
        gc.quadraticCurveTo(x, y + height, x, y + height - radius);
        gc.lineTo(x, y + radius);
        gc.quadraticCurveTo(x, y, x + radius, y);
        gc.closePath();
        if (stroke) {
            gc.stroke();
        }
        if (fill) {
            gc.fill();
        }
        gc.closePath();
    }
});

CellRenderer.abstract = true; // don't instantiate directly

module.exports = CellRenderer;

},{"../Base":25}],49:[function(require,module,exports){
'use strict';

var CellRenderer = require('./CellRenderer');

/**
 * @constructor
 * @extends CellRenderer
 */
var ErrorCell = CellRenderer.extend('ErrorCell', {

    /**
     * @summary Writes error message into cell.
     *
     * @desc This function is guaranteed to be called as follows:
     *
     * ```javascript
     * gc.save();
     * gc.beginPath();
     * gc.rect(x, y, width, height);
     * gc.clip();
     * behavior.getCellProvider().renderCellError(gc, message, x, y, width, height);
     * gc.restore();
     * ```
     *
     * Before doing anything else, this function should clear the cell by setting `gc.fillStyle` and calling `gc.fill()`.
     *
     * @param {CanvasRenderingContext2D} gc
     * @param {object} config
     * @param {Rectangle} config.bounds - The clipping rect of the cell to be rendered.
     * @memberOf ErrorCell.prototype
     */
    paint: function(gc, config, message) {
        var x = config.bounds.x,
            y = config.bounds.y,
            // width = config.bounds.width,
            height = config.bounds.height;

        // clear the cell
        // (this makes use of the rect path defined by the caller)
        gc.cache.fillStyle = '#FFD500';
        gc.fill();

        // render message text
        gc.cache.fillStyle = '#A00';
        gc.cache.textAlign = 'start';
        gc.cache.textBaseline = 'middle';
        gc.cache.font = 'bold 6pt "arial narrow", verdana, geneva';
        gc.fillText(message, x + 4, y + height / 2 + 0.5);
    }
});

module.exports = ErrorCell;

},{"./CellRenderer":48}],50:[function(require,module,exports){
'use strict';

var CellRenderer = require('./CellRenderer');

/**
 * @constructor
 * @extends CellRenderer
 */
var LastSelection = CellRenderer.extend('LastSelection', {

    /**
     * @desc A rendering of the last Selection Model
     * @implements paintFunction
     * @memberOf LastSelection.prototype
     */
    paint: function(gc, config) {
        var visOverlay = gc.alpha(config.selectionRegionOverlayColor) > 0,
            visOutline = gc.alpha(config.selectionRegionOutlineColor) > 0;

        if (visOverlay || visOutline) {
            var x = config.bounds.x,
                y = config.bounds.y,
                width = config.bounds.width,
                height = config.bounds.height;

            gc.beginPath();

            gc.rect(x, y, width, height);

            if (visOverlay) {
                gc.cache.fillStyle = config.selectionRegionOverlayColor;
                gc.fill();
            }

            if (visOutline) {
                gc.cache.lineWidth = 1;
                gc.cache.strokeStyle = config.selectionRegionOutlineColor;
                gc.stroke();
            }

            gc.closePath();
        }
    }
});

module.exports = LastSelection;



},{"./CellRenderer":48}],51:[function(require,module,exports){
'use strict';

var CellRenderer = require('./CellRenderer');
var images = require('../../images');

var WHITESPACE = /\s\s+/g;

/**
 * @constructor
 * @extends CellRenderer
 */
var SimpleCell = CellRenderer.extend('SimpleCell', {

    /**
     * @summary The default cell rendering function for rendering a vanilla cell.
     * @desc Great care has been taken in crafting this function as it needs to perform extremely fast. Reads on the gc object are expensive but not quite as expensive as writes to it. We do our best to avoid writes, then avoid reads. Clipping bounds are not set here as this is also an expensive operation. Instead, we truncate overflowing text and content by filling a rectangle with background color column by column instead of cell by cell.  This column by column fill happens higher up on the stack in a calling function from fin-hypergrid-renderer.  Take note we do not do cell by cell border rendering as that is expensive.  Instead we render many fewer gridlines after all cells are rendered.
     * @implements paintFunction
     * @memberOf SimpleCell.prototype
     */
    paint: function(gc, config) {
        var val = config.value,
            bounds = config.bounds,
            x = bounds.x,
            y = bounds.y,
            width = bounds.width,
            height = bounds.height,
            iconPadding = config.iconPadding,
            partialRender = config.prefillColor === undefined, // signifies abort before rendering if same
            snapshot = config.snapshot,
            same = snapshot && partialRender,
            valWidth = 0,
            textColor, textFont,
            ixoffset, iyoffset,
            leftIcon, rightIcon, centerIcon,
            leftPadding, rightPadding,
            hover, hoverColor, selectColor, foundationColor, inheritsBackgroundColor,
            c, colors;

        // setting gc properties are expensive, let's not do it needlessly

        if (val && val.constructor === Array) {
            leftIcon = val[0];
            rightIcon = val[2];
            val = config.exec(val[1]);
            if (val && val.naturalWidth !== undefined) { // must be an image (much faster than instanceof HTMLImageElement)
                centerIcon = val;
                val = null;
            }
        } else {
            leftIcon = images[config.leftIcon];
            centerIcon = images[config.centerIcon];
            rightIcon = images[config.rightIcon];
        }

        // Note: vf == 0 is fastest equivalent of vf === 0 || vf === false which excludes NaN, null, undefined
        var renderValue = val || config.renderFalsy && val == 0; // eslint-disable-line eqeqeq

        if (renderValue) {
            val = config.formatValue(val, config);

            textFont = config.isSelected ? config.foregroundSelectionFont : config.font;

            textColor = gc.cache.strokeStyle = config.isSelected
                ? config.foregroundSelectionColor
                : config.color;
        } else {
            val = '';
        }

        same = same &&
            val === snapshot.value &&
            textFont === snapshot.textFont &&
            textColor === snapshot.textColor;

        // fill background only if our bgColor is populated or we are a selected cell
        colors = [];
        c = 0;
        if (config.isCellHovered && config.hoverCellHighlight.enabled) {
            hoverColor = config.hoverCellHighlight.backgroundColor;
        } else if (config.isRowHovered && (hover = config.hoverRowHighlight).enabled) {
            hoverColor = config.isDataColumn || !hover.header || hover.header.backgroundColor === undefined ? hover.backgroundColor : hover.header.backgroundColor;
        } else if (config.isColumnHovered && (hover = config.hoverColumnHighlight).enabled) {
            hoverColor = config.isDataRow || !hover.header || hover.header.backgroundColor === undefined ? hover.backgroundColor : hover.header.backgroundColor;
        }
        if (gc.alpha(hoverColor) < 1) {
            if (config.isSelected) {
                selectColor = config.backgroundSelectionColor;
            }

            if (gc.alpha(selectColor) < 1) {
                inheritsBackgroundColor = (config.backgroundColor === config.prefillColor);
                if (!inheritsBackgroundColor) {
                    foundationColor = true;
                    colors.push(config.backgroundColor);
                    same = same &&  foundationColor === snapshot.foundationColor &&
                        config.backgroundColor === snapshot.colors[c++];
                }
            }

            if (selectColor !== undefined) {
                colors.push(selectColor);
                same = same && selectColor === snapshot.colors[c++];
            }
        }
        if (hoverColor !== undefined) {
            colors.push(hoverColor);
            same = same && hoverColor === snapshot.colors[c++];
        }

        // todo check if icons have changed
        if (same && c === snapshot.colors.length) {
            return;
        }

        // return a snapshot to save in cellEvent for future comparisons by partial renderer
        config.snapshot = {
            value: val,
            textColor: textColor,
            textFont: textFont,
            foundationColor: foundationColor,
            colors: colors
        };

        layerColors(gc, colors, x, y, width, height, foundationColor);

        // Measure left and right icons, needed for rendering and for return value (min width)
        leftPadding = leftIcon ? iconPadding + leftIcon.width + iconPadding : config.cellPadding;
        rightPadding = rightIcon ? iconPadding + rightIcon.width + iconPadding : config.cellPadding;

        if (renderValue) {
            // draw text
            gc.cache.fillStyle = textColor;
            gc.cache.font = textFont;
            valWidth = config.isHeaderRow && config.headerTextWrapping
                ? renderMultiLineText(gc, config, val, leftPadding, rightPadding)
                : renderSingleLineText(gc, config, val, leftPadding, rightPadding);
        } else if (centerIcon) {
            // Measure & draw center icon
            iyoffset = Math.round((height - centerIcon.height) / 2);
            ixoffset = Math.round((width - centerIcon.width) / 2);
            gc.drawImage(centerIcon, x + width - ixoffset - centerIcon.width, y + iyoffset);
            valWidth = iconPadding + centerIcon.width + iconPadding;
        }

        if (leftIcon) {
            // Draw left icon
            iyoffset = Math.round((height - leftIcon.height) / 2);
            gc.drawImage(leftIcon, x + iconPadding, y + iyoffset);
        }

        if (rightIcon) {
            // Repaint background before painting right icon, because text may have flowed under where it will be.
            // This is a work-around to clipping which is too expensive to perform here.
            var rightX = x + width - (rightIcon.width + iconPadding);
            if (inheritsBackgroundColor) {
                foundationColor = true;
                colors.unshift(config.backgroundColor);
            }
            layerColors(gc, colors, rightX, y, rightPadding, height, foundationColor);

            // Draw right icon
            iyoffset = Math.round((height - rightIcon.height) / 2);
            gc.drawImage(rightIcon, rightX, y + iyoffset);
        }

        if (config.cellBorderThickness) {
            gc.beginPath();
            gc.rect(x, y, width, height);
            gc.cache.lineWidth = config.cellBorderThickness;
            gc.cache.strokeStyle = config.cellBorderStyle;
            gc.stroke();
            gc.closePath();
        }

        config.minWidth = leftPadding + valWidth + rightPadding;
    }
});

/**
 * @summary Renders single line text.
 * @param {CanvasRenderingContext2D} gc
 * @param {object} config
 * @param {Rectangle} config.bounds - The clipping rect of the cell to be rendered.
 * @param {*} val - The text to render in the cell.
 * @memberOf SimpleCell.prototype
 */
function renderMultiLineText(gc, config, val, leftPadding, rightPadding) {
    var x = config.bounds.x,
        y = config.bounds.y,
        width = config.bounds.width,
        height = config.bounds.height,
        cleanVal = (val + '').trim().replace(WHITESPACE, ' '), // trim and squeeze whitespace
        lines = findLines(gc, config, cleanVal.split(' '), width);

    if (lines.length === 1) {
        return renderSingleLineText(gc, config, cleanVal, leftPadding, rightPadding);
    }

    var halignOffset = leftPadding,
        valignOffset = config.voffset,
        halign = config.halign,
        textHeight = gc.getTextHeight(config.font).height;

    switch (halign) {
        case 'right':
            halignOffset = width - rightPadding;
            break;
        case 'center':
            halignOffset = width / 2;
            break;
    }

    var hMin = 0, vMin = Math.ceil(textHeight / 2);

    valignOffset += Math.ceil((height - (lines.length - 1) * textHeight) / 2);

    halignOffset = Math.max(hMin, halignOffset);
    valignOffset = Math.max(vMin, valignOffset);

    gc.cache.save(); // define a clipping region for cell
    gc.beginPath();
    gc.rect(x, y, width, height);
    gc.clip();

    gc.cache.textAlign = halign;
    gc.cache.textBaseline = 'middle';

    for (var i = 0; i < lines.length; i++) {
        gc.simpleText(lines[i], x + halignOffset, y + valignOffset + (i * textHeight));
    }

    gc.cache.restore(); // discard clipping region

    return width;
}

/**
 * @summary Renders single line text.
 * @param {CanvasRenderingContext2D} gc
 * @param {object} config
 * @param {Rectangle} config.bounds - The clipping rect of the cell to be rendered.
 * @param {*} val - The text to render in the cell.
 * @memberOf SimpleCell.prototype
 */
function renderSingleLineText(gc, config, val, leftPadding, rightPadding) {
    var x = config.bounds.x,
        y = config.bounds.y,
        width = config.bounds.width,
        halignOffset = leftPadding,
        halign = config.halign,
        minWidth,
        metrics;

    if (config.columnAutosizing) {
        metrics = gc.getTextWidthTruncated(val, width - leftPadding, config.truncateTextWithEllipsis);
        minWidth = metrics.width;
        val = metrics.string || val;
        switch (halign) {
            case 'right':
                halignOffset = width - rightPadding - metrics.width;
                break;
            case 'center':
                halignOffset = (width - metrics.width) / 2;
                break;
        }
    } else {
        metrics = gc.getTextWidthTruncated(val, width - leftPadding, config.truncateTextWithEllipsis, true);
        minWidth = 0;
        if (metrics.string !== undefined) {
            val = metrics.string;
        } else {
            switch (halign) {
                case 'right':
                    halignOffset = width - rightPadding - metrics.width;
                    break;
                case 'center':
                    halignOffset = (width - metrics.width) / 2;
                    break;
            }
        }
    }

    if (val !== null) {
        x += Math.max(leftPadding, halignOffset);
        y += config.bounds.height / 2;

        if (config.isUserDataArea) {
            if (config.link) {
                if (config.isCellHovered || !config.linkOnHover) {
                    if (config.linkColor) {
                        gc.cache.strokeStyle = config.linkColor;
                    }
                    gc.beginPath();
                    underline(config, gc, val, x, y, 1);
                    gc.stroke();
                    gc.closePath();
                }
                if (config.linkColor && (config.isCellHovered || !config.linkColorOnHover)) {
                    gc.cache.fillStyle = config.linkColor;
                }
            }

            if (config.strikeThrough === true) {
                gc.beginPath();
                strikeThrough(config, gc, val, x, y, 1);
                gc.stroke();
                gc.closePath();
            }
        }

        gc.cache.textAlign = 'left';
        gc.cache.textBaseline = 'middle';
        gc.simpleText(val, x, y);
    }

    return minWidth;
}

function findLines(gc, config, words, width) {

    if (words.length === 1) {
        return words;
    }

    // starting with just the first word...
    var stillFits, line = [words.shift()];
    while (
        // so lone as line still fits within current column...
    (stillFits = gc.getTextWidth(line.join(' ')) < width)
    // ...AND there are more words available...
    && words.length
        ) {
        // ...add another word to end of line and retest
        line.push(words.shift());
    }

    if (
        !stillFits // if line is now too long...
        && line.length > 1 // ...AND is multiple words...
    ) {
        words.unshift(line.pop()); // ...back off by (i.e., remove) one word
    }

    line = [line.join(' ')];

    if (words.length) { // if there's anything left...
        line = line.concat(findLines(gc, config, words, width)); // ...break it up as well
    }

    return line;
}

function strikeThrough(config, gc, text, x, y, thickness) {
    var textWidth = gc.getTextWidth(text);

    switch (gc.cache.textAlign) {
        case 'center':
            x -= textWidth / 2;
            break;
        case 'right':
            x -= textWidth;
            break;
    }

    y = Math.round(y + 0.5) - 0.5;

    gc.cache.lineWidth = thickness;
    gc.moveTo(x - 1, y);
    gc.lineTo(x + textWidth + 1, y);
}

function underline(config, gc, text, x, y, thickness) {
    var textHeight = gc.getTextHeight(config.font).height,
        textWidth = gc.getTextWidth(text);

    switch (gc.cache.textAlign) {
        case 'center':
            x -= textWidth / 2;
            break;
        case 'right':
            x -= textWidth;
            break;
    }

    y = Math.round(y + textHeight / 2) - 0.5;

    //gc.beginPath();
    gc.cache.lineWidth = thickness;
    gc.moveTo(x, y);
    gc.lineTo(x + textWidth, y);
}

function layerColors(gc, colors, x, y, width, height, foundationColor) {
    for (var i = 0; i < colors.length; i++) {
        if (foundationColor && !i) {
            gc.clearFill(x, y, width, height, colors[i]);
        } else {
            gc.cache.fillStyle = colors[i];
            gc.fillRect(x, y, width, height);
        }
    }
}

module.exports = SimpleCell;

},{"../../images":11,"./CellRenderer":48}],52:[function(require,module,exports){
'use strict';

var CellRenderer = require('./CellRenderer');

/**
 * @constructor
 * @extends CellRenderer
 */
var Slider = CellRenderer.extend('Slider', {

    /**
     * @desc Emerson's paint function for a slider button. currently the user cannot interact with it
     * @implements paintFunction
     * @memberOf Slider.prototype
     */
    paint: function(gc, config) {
        var x = config.bounds.x,
            y = config.bounds.y,
            width = config.bounds.width,
            height = config.bounds.height;
        gc.cache.strokeStyle = 'white';
        var val = config.value;
        var radius = height / 2;
        var offset = width * val;
        var bgColor = config.isSelected ? config.backgroundColor : '#333333';
        var btnGradient = gc.createLinearGradient(x, y, x, y + height);
        btnGradient.addColorStop(0, bgColor);
        btnGradient.addColorStop(1, '#666666');
        var arcGradient = gc.createLinearGradient(x, y, x, y + height);
        arcGradient.addColorStop(0, '#aaaaaa');
        arcGradient.addColorStop(1, '#777777');
        gc.cache.fillStyle = btnGradient;
        this.roundRect(gc, x, y, width, height, radius, btnGradient);
        if (val < 1.0) {
            gc.cache.fillStyle = arcGradient;
        } else {
            gc.cache.fillStyle = '#eeeeee';
        }
        gc.beginPath();
        gc.arc(x + Math.max(offset - radius, radius), y + radius, radius, 0, 2 * Math.PI);
        gc.fill();
        gc.closePath();
        config.minWidth = 100;
    }
});

module.exports = Slider;

},{"./CellRenderer":48}],53:[function(require,module,exports){
'use strict';

var CellRenderer = require('./CellRenderer');

/**
 * @constructor
 * @extends CellRenderer
 */
var SparkBar = CellRenderer.extend('SparkBar', {

    /**
     * @desc A simple implementation of a sparkline, because it's a barchart we've changed the name ;).
     * @implements paintFunction
     * @memberOf SparkBar.prototype
     */
    paint: function(gc, config) {
        var x = config.bounds.x,
            y = config.bounds.y,
            width = config.bounds.width,
            height = config.bounds.height;

        gc.beginPath();
        var val = config.value;
        if (!val || !val.length) {
            return;
        }
        var count = val.length;
        var eWidth = width / count;
        var fgColor = config.isSelected ? config.foregroundSelectionColor : config.color;
        if (config.backgroundColor || config.isSelected) {
            gc.cache.fillStyle = config.isSelected ? 'blue' : config.backgroundColor;
            gc.fillRect(x, y, width, height);
        }
        gc.cache.fillStyle = fgColor;
        for (var i = 0; i < val.length; i++) {
            var barheight = val[i] / 110 * height;
            gc.fillRect(x + 5, y + height - barheight, eWidth * 0.6666, barheight);
            x += eWidth;
        }
        gc.closePath();
        config.minWidth = count * 10;
    }
});

module.exports = SparkBar;

},{"./CellRenderer":48}],54:[function(require,module,exports){
'use strict';

var CellRenderer = require('./CellRenderer');

/**
 * @constructor
 * @extends CellRenderer
 */
var SparkLine = CellRenderer.extend('SparkLine', {

    /**
     * @desc A simple implementation of a sparkline.  see [Edward Tufte sparkline](http://www.edwardtufte.com/bboard/q-and-a-fetch-msg?msg_id=0001OR)
     * @implements paintFunction
     * @memberOf SparkLine.prototype
     */
    paint: function(gc, config) {
        var x = config.bounds.x,
            y = config.bounds.y,
            width = config.bounds.width,
            height = config.bounds.height;

        gc.beginPath();
        var val = config.value;
        if (!val || !val.length) {
            return;
        }
        var count = val.length;
        var eWidth = width / count;

        var fgColor = config.isSelected ? config.foregroundSelectionColor : config.color;
        if (config.backgroundColor || config.isSelected) {
            gc.cache.fillStyle = config.isSelected ? config.backgroundSelectionColor : config.backgroundColor;
            gc.fillRect(x, y, width, height);
        }
        gc.cache.strokeStyle = fgColor;
        gc.cache.fillStyle = fgColor;
        gc.beginPath();
        var prev;
        for (var i = 0; i < val.length; i++) {
            var barheight = val[i] / 110 * height;
            if (!prev) {
                prev = barheight;
            }
            gc.lineTo(x + 5, y + height - barheight);
            gc.arc(x + 5, y + height - barheight, 1, 0, 2 * Math.PI, false);
            x += eWidth;
        }
        config.minWidth = count * 10;
        gc.stroke();
        gc.closePath();
    }
});

module.exports = SparkLine;

},{"./CellRenderer":48}],55:[function(require,module,exports){
'use strict';

var CellRenderer = require('./CellRenderer');

/**
 * @constructor
 * @extends CellRenderer
 */
var TreeCell = CellRenderer.extend('TreeCell', {

    /**
     * @desc A simple implementation of a tree cell renderer for use mainly with the tree column.
     * @implements paintFunction
     * @memberOf TreeCell.prototype
     */
    paint: function(gc, config) {
        var x = config.bounds.x,
            y = config.bounds.y,
            width = config.bounds.width,
            height = config.bounds.height;

        var val = config.value.data;
        var indent = config.value.indent;
        var icon = config.value.icon;

        //fill background only if our bgColor is populated or we are a selected cell
        if (config.backgroundColor || config.isSelected) {
            gc.cache.fillStyle = config.isSelected ? config.backgroundColor : config.backgroundColor;
            gc.fillRect(x, y, width, height);
        }

        if (!val || !val.length) {
            return;
        }
        var valignOffset = Math.ceil(height / 2);

        gc.cache.fillStyle = config.isSelected ? config.backgroundColor : config.backgroundColor;
        gc.fillText(icon + val, x + indent, y + valignOffset);

        var textWidth = gc.getTextWidth(icon + val);
        var minWidth = x + indent + textWidth + 10;
        config.minWidth = minWidth;
    }
});

module.exports = TreeCell;

},{"./CellRenderer":48}],56:[function(require,module,exports){
'use strict';

var Registry = require('../lib/Registry');


var warnedBaseClass;

/**
 * @classdesc Registry of cell renderer singletons.
 * @param {boolean} [privateRegistry=false] - This instance will use a private registry.
 * @constructor
 */
var CellRenderers = Registry.extend('CellRenderers', {

    BaseClass: require('./CellRenderer'), // abstract base class

    items: {}, // shared cell renderer registry (when !options.private)

    singletons: true,

    initialize: function(options) {
        // preregister the standard cell renderers
        if (options && options.private || !this.items.simplecell) {
            this.add(require('./Button'));
            this.add(require('./SimpleCell'));
            this.add(require('./SliderCell'));
            this.add(require('./SparkBar'));
            this.add(require('./LastSelection'));
            this.add(require('./SparkLine'));
            this.add(require('./ErrorCell'));
            this.add(require('./TreeCell'));
        }
    },

    get: function(name) {
        if (name && name.toLowerCase() === 'emptycell') {
            if (!warnedBaseClass) {
                console.warn('grid.cellRenderers.get("' + name + '").constructor has been deprecated as of v2.1.0 in favor of grid.cellRenderers.BaseClass property. (Will be removed in a future release.)');
                warnedBaseClass = true;
            }
            this.BaseClass.constructor = this.BaseClass;
            return this.BaseClass;
        }
        return this.super.get.call(this, name);
    }

});

CellRenderers.add = Registry.prototype.add.bind(CellRenderers);

module.exports = CellRenderers;

},{"../lib/Registry":80,"./Button":47,"./CellRenderer":48,"./ErrorCell":49,"./LastSelection":50,"./SimpleCell":51,"./SliderCell":52,"./SparkBar":53,"./SparkLine":54,"./TreeCell":55}],57:[function(require,module,exports){
'use strict';

var Base = require('../Base');
var modules = require('../Hypergrid/modules');

/**
 * > This constructor (actually {@link DataModel#initialize}) will be called upon instantiation of this class or of any class that extends from this class. See {@link https://github.com/joneit/extend-me|extend-me} for more info.
 * @name dataModels.JSON
 * @param {Hypergrid} grid
 * @param {object} [options] - Not used here.
 * @constructor
 */
var DataModel = Base.extend('DataModel', {

    initialize: function(grid, options) {
        this.grid = grid;

        if (!this.on) {
            // mix this in now (rather than at declaration time) in case developer wants to replace `modules.events`.
            DataModel.prototype.mixIn(modules.events); // so data source can talk back (trigger events)
        }

        this.on('data-changed', grid.fireDataChangedEvent.bind(grid, true));
    },

    getRowMetadata: function(y, metadata) {
        return this.dataSource.getRowMetadata(y, metadata);
    },

    setRowMetadata: function(y, metadata) {
        return this.dataSource.setRowMetadata(y, metadata);
    },

    makeInterface: require('./interfaceFactory').makeInterface,

    /**
     * @param {object} config
     * @param {string} declaredRendererName - The proposed cell renderer name (form the render properties).
     * @returns {CellRenderer}
     * @memberOf DataModel.prototype
     */
    getCell: function(config, declaredRendererName) {
        return this.grid.cellRenderers.get(declaredRendererName);
    },

    /**
     * @summary Instantiate a new cell editor.
     * @desc The application developer may override this method to:
     * * Instantiate and return an arbitrary cell editor. The generic implementation here simply returns the declared cell editor. This is `undefined` when there was no such declaration, or if the named cell editor was not registered.
     * * Return `undefined` for no cell editor at all. The cell will not be editable.
     * * Set properties on the instance by passing them in the `options` object. These are applied to the new cell editor object after instantiation but before rendering.
     * * Manipulate the cell editor object (including its DOM elements) after rendering but before DOM insertion.
     *
     * Overriding this method with a null function (that always returns `undefined`) will have the effect of making all cells uneditable.
     *
     * @param {number} columnIndex - Absolute column index. I.e., the position of the column in the data source's original `fields` array, as echoed in `behavior.allColumns[]`.
     *
     * @param {number} rowIndex - Row index of the data row in the current list of rows, regardless of vertical scroll position, offset by the number of header rows (all the rows above the first data row including the filter row). I.e., after subtracting out the number of header rows, this is the position of the data row in the `index` array of the data source (i.e., the last data source pipeline).
     *
     * @param {string} declaredEditorName - The proposed cell editor name (from the render properties).
     *
     * @param {CellEvent} cellEvent - All enumerable properties of this object will be copied to the new cell editor object for two purposes:
     * * Used in cell editor logic.
     * * For access from the cell editor's HTML template (via mustache).
     *
     * {@link CellEditor} requires both of the following:
     * * **`format`** - The cell's `format` render prop (name of localizer to use to format the editor preload and parse the edited value). May be `undefined` (no formatting or parsing). Added by calling {@link Column#getCellEditorAt|getCellEditorAt} method. Developer's override is free to alter this property.
     * * _CellEvent props_ - `column` ({@link Column} object) is the only enumerable property of the native `CellEvent` object. Read-only.
     * * _Custom props_ - Developer's override of this method may add additional properties, for both purposes listed above.
     *
     * Note that the `editPoint` property previously available to cell editors has been deprecated in favor of options.gridCell. `editPoint` will still work for the time being but with a deprecation warning in the console to use `cellEvent.gridCell` instead.
     *
     * @returns {undefined|CellEditor} An object instantiated from the registered cell editor constructor named in `declaredEditorName`. A falsy return means the cell is not editable because the `declaredEditorName` was not registered.
     *
     * @memberOf DataModel.prototype
     */
    getCellEditorAt: function(columnIndex, rowIndex, declaredEditorName, cellEvent) {
        return this.grid.cellEditors.create(declaredEditorName, cellEvent);
    }

});


module.exports = DataModel;

},{"../Base":25,"../Hypergrid/modules":28,"./interfaceFactory":61}],58:[function(require,module,exports){
'use strict';

var DataModel = require('./DataModel');

/**
 * @implements dataModelAPI
 * @param {Hypergrid} grid
 * @param {object} [options]
 * @param {string} [options.name]
 * @constructor
 */
var HeaderSubgrid = DataModel.extend('HeaderSubgrid', {
    initialize: function(grid, options) {
        options = options || {};

        this.behavior = grid.behavior;

        var fallbacks = this.makeInterface(options);
        this.getRowMetadata = fallbacks.getRowMetadata;
        this.setRowMetadata = fallbacks.setRowMetadata;

        if (options.name) {
            this.name = options.name;
        }
    },

    type: 'header',

    format: 'header', // override column format

    getRowCount: function() {
        return this.grid.properties.showHeaderRow ? 1 : 0;
    },

    getValue: function(x, y) {
        var column = this.behavior.getColumn(x);
        return column.header || column.name; // use field name when header undefined
    },

    setValue: function(x, y, value) {
        if (y < this.getRowCount()) {
            this.behavior.getColumn(x).header = value;
        }
    },

    getRow: function(y) {
        return this.dataRow;
    },

    getRowMetadata: function(y, metadata) {
        return this.metadata || (this.metadata = metadata);
    },

    setRowMetadata: function(y, metadata) {
        return (this.metadata = metadata);
    }
});

module.exports = HeaderSubgrid;

},{"./DataModel":57}],59:[function(require,module,exports){
'use strict';

var DataModel = require('./DataModel');

/**
 * > This constructor (actually {@link dataModels.JSON#initialize}) will be called upon instantiation of this class or of any class that extends from this class. See {@link https://github.com/joneit/extend-me|extend-me} for more info.
 * @name dataModels.JSON
 * @param {Hypergrid} grid
 * @param {object} [options]
 * @param {DataSource} [options.DataSource] - Must be supplied on first call; optional thereafter.
 * @param {object[]} [options.data]
 * @param {object[]} [options.schema]
 * @constructor
 * @extends DataModel
 */
var JSON = DataModel.extend('dataModels.JSON', {

    initialize: function(grid, options) {
        this.charMap = new CharMap(this);
        this.reset(options);
    },

    /**
     * @param {object} [options]
     * @param {function} [options.DataSource] - Data source constructor.
     * @param {DataSource} [options.dataSource] - Fully instantiated data source.
     * @param {object[]} [options.data]
     * @param {object[]} [options.schema]
     * @param {object|Array} [options.metadataStore=[]] - _See {@link DataModel#makeInterface}._
     * @param {object} [options.interfaceAdditions] - _See {@link DataModel#makeInterface}._
     * @memberOf dataModels.JSON.prototype
     */
    reset: function(options) {
        var newDataSource, DataSource;

        options = options || {};

        if (options.dataSource) {
            newDataSource = options.dataSource;
        } else if ((DataSource = this.DataSource = options.DataSource || this.DataSource || JSON.DataSource)) {
            newDataSource = new DataSource;
        }

        if (newDataSource && newDataSource !== this.dataSource) {
            if (newDataSource.setInterface) {
                newDataSource.setInterface(this.makeInterface(options));
            }
            if (options.schema) {
                newDataSource.setSchema(options.schema);
            }
            if (options.data && !options.dataSource) {
                newDataSource.setData(options.data);
            }
            this.dataSource = newDataSource;
            buildRowAccessor.call(this);
        }

        if (!this.dataSource) {
            throw new this.HypergridError('Expected a data source. (Define options.dataSource or options.DataSource.)');
        }
    },

    getData: function() {
        return this.deprecated('getData()', 'dataSource.getData()', '3.0.0', arguments, 'Get data is problematic and should not be called (see https://github.com/fin-hypergrid/core/wiki/getRow-and-getData-Abuse). The fallback will copy the rows and all their data. If your data source has an implementation (and you know what you\'re doing), call it directly.');
    },

    getIndexedData: function() {
        return this.deprecated('getIndexedData()', 'dataSource.getData()', '3.0.0', arguments, 'This method was originally provided to get all the data from the tip of the data source (in a cascading datasource, rather than from the origin), which would be the subset of (transformed) rows with their transformed indexes. This was ill-advised because the right way to do this would have been to implement a `getRow` at the tip.');
    },

    /**
     * @param {number} x - Data column coordinate.
     * @param {number} y - Data row coordinate.
     * @memberOf dataModels.JSON.prototype
     */
    getValue: function(x, y) {
        return this.dataSource.getValue(x, y);
    },

    /**
     * @param {number} y - Data row coordinate.
     * @returns {nunber} Row index in raw data array after dereferencing all data source indexing.
     * @memberOf dataModels.JSON.prototype
     */
    getDataIndex: function(y) {
        return this.dataSource.getDataIndex(y);
    },

    /**
     * @memberOf dataModels.JSON.prototype
     * @param {number} x - Data column coordinate.
     * @param {number} r - Grid row coordinate.
     * @param value
     */
    setValue: function(x, r, value) {
        this.dataSource.setValue(x, r, value);
    },

    /**
     * @memberOf dataModels.JSON.prototype
     * @returns {number}
     */
    getColumnCount: function() {
        var offset = this.grid.behavior.hasTreeColumn() ? -1 : 0;
        return this.dataSource.getColumnCount() + offset;
    },

    /**
     * @memberOf dataModels.JSON.prototype
     * @returns {number}
     */
    getRowCount: function() {
        return this.dataSource.getRowCount();
    },

    /**
     * @memberOf dataModels.JSON.prototype
     */
    reindex: function() {
        var selectedRowSourceIndexes = getUnderlyingIndexesOfSelectedRows.call(this);
        this.dataSource.apply();
        reselectRowsByUnderlyingIndexes.call(this, selectedRowSourceIndexes);
    },

    /**
     * @summary Set or reset grid data.
     * See {@link DataSource#setData} for details.
     * @memberOf dataModels.JSON.prototype
     */
    setData: function(dataSource, schema) {
        this.dataSource.setData(dataSource, schema);
        if (schema) {
            buildRowAccessor.call(this);
        }
    },

    isTree: function() {
        return this.dataSource.isDrillDown();
    },

    isTreeCol: function(event) {
        return this.dataSource.isDrillDownCol(event);
    },

    /**
     * @memberOf dataModels.JSON.prototype
     * @param index
     * @param returnAsString
     * @desc Provides the unicode character used to denote visually if a column is a sorted state
     * @returns {*}
     */
    getSortImageForColumn: function(columnIndex) {
        //Not implemented
    },

    /**
     * @param cell
     * @param event
     * @return {boolean} Clicked in a drill-down column.
     * @memberOf dataModels.JSON.prototype
     */
    cellClicked: function(event) {
        return this.toggleRow(event.dataCell.y, undefined, event);
    },

    /**
     * @summary Toggle the drill-down control of a the specified row.
     * @desc Operates only on the following rows:
     * * Expandable rows - Rows with a drill-down control.
     * * Revealed rows - Rows not hidden inside of collapsed drill-downs.
     * @param y - Revealed row number. (This is not the row ID.)
     * @param {boolean} [expand] - One of:
     * * `true` - Expand row.
     * * `false` - Collapse row.
     * * `undefined` (or omitted) - Toggle state of row.
     * @param event
     * @returns {boolean|undefined} Changed. Specifically, one of:
     * * `undefined` row had no drill-down control
     * * `true` drill-down changed
     * * `false` drill-down unchanged (was already in requested state)
     * @memberOf dataModels.JSON.prototype
     */
    toggleRow: function(y, expand, event) {
        //TODO: fire a row toggle event
        var changed;
        if (this.isTreeCol(event)) {
            changed = this.dataSource.click(y, expand);
            if (changed) {
                this.reindex();
                this.grid.behavior.changed();
            }
        }
        return changed;
    },

    /**
     * @param {number} r - Data row coordinate.
     * @returns {object|undefined} Returns data row object or `undefined` if a header row.
     * @memberOf dataModels.JSON.prototype
     */
    getRow: function(r) {
        return this.dataSource.getRow(r);
    },

    get schema() {
        return this.dataSource.getSchema();
    },

    set schema(schema) {
        this.dataSource.setSchema(schema);
        buildRowAccessor.call(this);
    }
});

/**
 * @function buildRowAccessor
 *
 * @summary Build a `dataSource.getRow` fallback based on current `schema`.
 *
 * @desc The accessor is a dataRow-like object (a hash of column values keyed by column name)
 * for the particular row whose index is in `.$$rowIndex`.
 *
 * The row index can be conveniently set with a call to the accessor's `.$$getRow()` method,
 * which sets the row index and returns the accessor itself
 * (which is why it's more logically called `$$getRow` instead of `$$setRowIndex`).
 *
 * `$$rowIndex` and `$$getRow` are "hidden" members:
 * * They are non-enumerable so they won't show up in `Object.keys(...)`.
 * * They sport leading `__` to reduce the chance of clashing with actual column names.
 *
 * In this fallback implementation, the enumerable members are all getters that invoke `getValue`.
 *
 * This function should be called each time a new schema is set (_i.e.,_ on instantiation and again whenever setData is called with a defined schema).
 *
 * @this {dataModels.JSON}
 */
function buildRowAccessor() {
    var dataSource = this.dataSource,
        columnEnum = {},
        rowAccessor = Object.create(null, {
            $$rowIndex: {
                writable: true
            },
            $$getRow: {
                value: function(rowIndex) {
                    this.$$rowIndex = rowIndex;
                    return this;
                }
            }
        });

    this.schema.forEach(function(columnSchema, columnIndex) {
        columnEnum[columnSchema.name] = columnIndex;
        Object.defineProperty(rowAccessor, columnSchema.name, {
            enumerable: true,
            get: function() {
                return dataSource.getValue(columnIndex, this.$$rowIndex);
            },
            set: function(value) {
                return dataSource.setValue(columnIndex, this.$$rowIndex, value);
            }
        });
    });

    this.columnEnum = columnEnum;
    this.rowAccessor = rowAccessor;
}


/** @name DataSource
 * @memberOf JSON
 * @default require('datasaur-local')
 * @summary Default data source.
 * @desc If defined, will be used as a default data source for newly instantiated
 * `Hypergrid` objects that do not have a defined `DataSource` option specified.
 *
 * This property is defined as a getter for now purely to be able to issue a deprecation warning that
 * the current default, `require('datasaur-local')`, has been deprecated as of v3 to be removed in v4.
 * Starting with v4, the application developer will be expected to define one of:
 * * a default data source `JSON.DataSource`; or
 * * a `DataSource` option for each grid instantiation.
 */
var DataSource = require('datasaur-local');
var warnDataSource;
Object.defineProperty(JSON, 'DataSource', {
    enumerable: true,
    get: function() {
        if (!warnDataSource) {
            console.warn('The default data source, `require(\'datasaur-local\')`, has been deprecated as of v3.0.0. Starting with v4, you must define either a default data source in `JSON.DataSource` or a `DataSource` option for each grid instantiation. For more info, see: https://github.com/fin-hypergrid/core/wiki/Data-Source');
            warnDataSource = true;
        }
        return DataSource;
    },
    set: function(Constructor) {
        DataSource = Constructor;
    }
});

// LOCAL METHODS -- to be called with `.call(this`

/**
 * Save underlying data row indexes backing current grid row selections.
 * This call should be paired with a subsequent call to `reselectGridRowsBackedBySelectedDataRows`.
 * @private
 * @this {dataModels.JSON}
 * @memberOf dataModels.JSON~
 */
function getUnderlyingIndexesOfSelectedRows() {
    var sourceIndexes = [],
        dataSource = this.dataSource;

    if (this.grid.properties.checkboxOnlyRowSelections) {
        this.grid.getSelectedRows().forEach(function(selectedRowIndex) {
            sourceIndexes.push(dataSource.getDataIndex(selectedRowIndex));
        });
    }

    return sourceIndexes;
}

/**
 * Re-establish grid row selections based on underlying data row indexes saved by `getSelectedDataRowsBackingSelectedGridRows` which should be called first.
 * @private
 * @this {dataModels.JSON}
 * @memberOf dataModels.JSON~
 */
function reselectRowsByUnderlyingIndexes(sourceIndexes) {
    var i, r,
        rowCount = this.getRowCount(),
        selectedRowCount = sourceIndexes.length,
        rowIndexes = [],
        selectionModel = this.grid.selectionModel;

    selectionModel.clearRowSelection();

    if (this.grid.properties.checkboxOnlyRowSelections) {
        for (r = 0; selectedRowCount && r < rowCount; ++r) {
            i = sourceIndexes.indexOf(this.dataSource.getDataIndex(r));
            if (i >= 0) {
                rowIndexes.push(r);
                delete sourceIndexes[i]; // might make indexOf increasingly faster as deleted elements are not enumerable
                selectedRowCount--; // count down so we can bail early if all found
            }
        }

        rowIndexes.forEach(function(rowIndex) {
            selectionModel.selectRow(rowIndex);
        });
    }

    return rowIndexes.length;
}

function CharMap(dataModel) {
    this.dataModel = dataModel;
}
CharMap.prototype = {
    mixIn: require('overrider').mixIn,

    get OPEN() { return this.dataModel.dataSource.drillDownCharMap.OPEN; },
    set OPEN(s) { this.dataModel.dataSource.drillDownCharMap.OPEN = s; },

    get CLOSE() { return this.dataModel.dataSource.drillDownCharMap.CLOSE; },
    set CLOSE(s) { this.dataModel.dataSource.drillDownCharMap.CLOSE = s; },
};

module.exports = JSON;

},{"./DataModel":57,"datasaur-local":5,"overrider":20}],60:[function(require,module,exports){
'use strict';

/**
 * @namespace
 */
var dataModels = {
    DataModel: require('./DataModel'),
    JSON: require('./JSON'),
    HeaderSubgrid: require('./HeaderSubgrid')
};

// add and get are non-enumerable
Object.defineProperties(dataModels, {
    /**
     * @function
     * @memberOf dataModels
     * @summary Register a data model by name.
     */
    add: {
        value: function(name, Constructor) {
            this[name] = Constructor;
        }
    },
    /**
     * @function
     * @memberOf dataModels
     * @summary Lookup a registered data model by name.
     */
    get: {
        value: function(name) {
            return this[name];
        }
    },
    /**
     * @type {string[]}
     * @memberOf dataModels
     * @summary Array of names of registered data models.
     */
    keys: {
        get: function() {
            return Object.keys(this);
        }
    }
});

module.exports = dataModels;

},{"./DataModel":57,"./HeaderSubgrid":58,"./JSON":59}],61:[function(require,module,exports){
'use strict';

var template = {
    // Required methods (throw error)
    getSchema: unimplementedError,
    getValue: unimplementedError,
    getRowCount: unimplementedError,

    // Optional methods (fallbacks provided)
    getColumnCount: getColumnCount,
    getRow: getRow,
    getData: getData,
    getDataIndex: getDataIndex, // supports persisting row selections across data transformations
    getRowMetadata: getRowMetadata, // supports row and cell props
    setRowMetadata: setRowMetadata, // supports row and cell props
    getMetadata: getMetadata, // supports row and cell props
    setMetadata: setMetadata, // supports row and cell props

    // Discretionary methods with warnings (fail with one-time console warning)
    setData: unsupportedWarning,
    setSchema: unsupportedWarning, // called by Hypergrid only if you specify a schema on new or setData
    setValue: unsupportedWarning, // called by Hypergrid only if you edit a cell

    // Discretionary methods without warnings (fail silently)
    apply: failSilently,
    isDrillDown: failSilently,
    isDrillDownCol: failSilently,

    // Custom methods (fail with one-time console warning)

    // following methods may be set as follows using an interfaceExtenderCollection:
    // * by Hypergrid at instantiation time via the `interfaceAdditions` option
    // * by application or plugins after instantiation by calling `dataModel.dataSource.permit(interfaceAdditions)`

    // click: -Infinity,
    // getGrandTotals: -Infinity,
    // revealRow: -Infinity,
    // isLeafNode: -Infinity,
    // viewMakesSense: -Infinity
};

/**
 * @function makeInterface
 * @memberOf DataModel#
 * @summary Get data source interface with fallbacks.
 * @desc All fallback methods are bound to `dataModel` for fallback implementations.
 * @this {dataModels.JSON}
 * @param {object} [options]
 * @param {object[]|object} [options.metadataStore=[]] - Meta-data store for get/setRowMetadata fallbacks. Could be a hash instead of an array if array would be too large.
 * @param {object} [options.interfaceAdditions] - Additional interface requirements beyond those defined in `template`.
 * @returns {object} A hash representing the data source interface, _i.e.,_
 * the methods supported by the data source with fallbacks for optional methods (called when unimplemented by the data source):
 * * Fallbacks for required methods throw an error.
 * * Fallbacks for optional methods are generic. (A native implementation is usually preferred.)
 * * Fallbacks for discretionary methods issue a warning in the console on first invocation.
 * * Fallbacks for custom methods fail silently.
 */
function makeInterface(options) {
    // following collection utilized by get/setRowMetadata fallbacks
    this.metadata = options && options.metadataStore || [];

    var result = {
        triggerHypergridEvent: this.trigger
    };

    // mix in template and extensions
    Object.assign(result, template, options && options.interfaceAdditions);

    // bind all fallbacks to `this` (dataModel)
    Object.keys(result).forEach(function(key) {
        result[key] = result[key].bind(this);
    }, this);

    return result;
}

// general fallbacks

// fallback function that fails silently instead of issuing a warning or throwing an error
function failSilently() {}

// fallback function that issues a one-time warning
var warned = {};
function unsupportedWarning(methodName, returnValue) {
    if (!warned[methodName]) {
        console.warn('Data source does not support `' + methodName + '()`.');
        warned[methodName] = true;
    }
    return returnValue;
}

// fallback function that throws an error
function unimplementedError(methodName) {
    throw new (this.dataSource.DataSourceError || Error)('Expected data source to implement method `' + methodName + '()`.');
}

// explicit fallbacks

function getColumnCount() {
    return this.schema.length;
}

function getRow(y) {
    return this.rowAccessor.$$getRow(y);
}

function getData(metaDataColumnName) {
    var dataSource = this.dataSource,
        count = dataSource.getRowCount(),
        rows = new Array(count),
        includeMetadata = !!arguments.length;
    for (var y = 0; y < count; y++) {
        rows[y] = Object.assign({}, dataSource.getRow(y));
        if (includeMetadata){
            rows[y][metaDataColumnName] = this.getRowMetadata(y);
        }
    }
    return rows;
}

function getDataIndex(y) {
    return y;
}

/**
 * Get metadata, a hash of cell properties objects.
 * Each cell that has properties (and only such cells) have a properties object herein, keyed by column schema name.
 * @param {number} y
 * @param {object} [newMetadata] - If metadata not found sets metadata to `newMetadata` if given.
 * @returns {undefined|object} Metadata object if found; else `newMetadata` if given; else `undefined`.
 */
function getRowMetadata(y, newMetadata) {
    return this.metadata[y] || newMetadata && (this.metadata[y] = newMetadata);
}
function getMetadata() {
    return this.metadata;
}

/**
 * Set or clear metadata.
 * @param {number} y
 * @param {object} [metadata] - Hash of grid properties objects.
 * Each cell that has properties (and only such cells) have a properties object herein, keyed by column schema name.
 * If omitted, deletes properties object.
 * @returns {object|undefined} Returns `metadata`.
 */
function setRowMetadata(y, metadata) {
    if (metadata) {
        this.metadata[y] = metadata;
    } else {
        delete this.metadata[y];
    }
    return metadata;
}
function setMetadata(metadata) {
    this.metadata = metadata;
}

module.exports = {
    makeInterface: makeInterface,
    unimplementedError: unimplementedError,
    unsupportedWarning: unsupportedWarning,
    failSilently: failSilently
};

},{}],62:[function(require,module,exports){
'use strict';

var HypergridError = require('./lib/error');

var COLUMN_ONLY_PROPERTY = 'Attempt to set column-only property on a non-column properties object.';

var warned = {};

var propClassEnum = {
    COLUMNS: 1,
    STRIPES: 2,
    ROWS: 3,
    CELLS: 4
};

/**
 * This module lists the properties that can be set on a {@link Hypergrid} along with their default values.
 * Edit this file to override the defaults.
 * @module defaults
 */

var defaults = {

    set name(x) { throw new HypergridError(COLUMN_ONLY_PROPERTY); },
    set type(x) { throw new HypergridError(COLUMN_ONLY_PROPERTY); },
    set header(x) { throw new HypergridError(COLUMN_ONLY_PROPERTY); },
    set calculator(x) { throw new HypergridError(COLUMN_ONLY_PROPERTY); },

    mixIn: require('overrider').mixIn,

    /**
     * The default message to display in front of the canvas when there are no grid rows.
     * Format is HTML.
     * @default
     * @type {string}
     * @memberOf module:defaults
     */
    noDataMessage: '',

    /**
     * @summary List of subgrids by
     * @desc Restrict usage here to strings (naming data models) or arrays consisting of such a string + constructor arguments. That is, avoid {@link subgridSpec}'s function and object overloads and {@link subgridConstructorRef} function overload.
     * @default "[ 'HeaderSubgrid', 'data' ]"
     * @type {subgridSpec[]}
     * @memberOf module:defaults
     */
    subgrids: [
        'HeaderSubgrid',
        'data'
    ],

    /**
     * @summary The global theme name.
     * @desc Note that local themes (applied to grid instances) will have an overriding `themeName` property in their theme layer in the properties hierarchy.
     * @default
     * @type {string}
     * @memberOf module:defaults
     */
    themeName: 'default',

    /**
     * The font for data cells.
     * @default
     * @type {cssFont}
     * @memberOf module:defaults
     */
    font: '13px Tahoma, Geneva, sans-serif',

    /**
     * Font color for data cells.
     * @default
     * @type {string}
     * @memberOf module:defaults
     */
    color: 'rgb(25, 25, 25)',

    /**
     * Background color for data cells.
     * @default
     * @type {string}
     * @memberOf module:defaults
     */
    backgroundColor: 'rgb(241, 241, 241)',

    /**
     * Font style for selected cell(s).
     * @default
     * @type {string}
     * @memberOf module:defaults
     */
    foregroundSelectionFont: 'bold 13px Tahoma, Geneva, sans-serif',

    /**
     * Font color for selected cell(s).
     * @default
     * @type {string}
     * @memberOf module:defaults
     */
    foregroundSelectionColor: 'rgb(0, 0, 128)',
    /**
     * Background color for selected cell(s).
     * @default
     * @type {string}
     * @memberOf module:defaults
     */
    backgroundSelectionColor: 'rgba(147, 185, 255, 0.625)',


    /********** SECTION: COLUMN HEADER COLORS **********/

    // IMPORTANT CAVEAT: The code is inconsistent regarding the terminology. Is the "column header" section _the row_ of cells at the top (that act as headers for each column) or is it _the column_ of cells (that act as headers for each row)? Oh my.

    /**
     * @default
     * @type {cssFont}
     * @memberOf module:defaults
     */
    columnHeaderFont: '12px Tahoma, Geneva, sans-serif',

    /**
     * @default
     * @type {cssColor}
     * @memberOf module:defaults
     */
    columnHeaderColor: 'rgb(25, 25, 25)',

    /**
     * Font style for selected columns' headers.
     * @default
     * @type {string}
     * @memberOf module:defaults
     */
    columnHeaderForegroundSelectionFont: 'bold 12px Tahoma, Geneva, sans-serif',

    /**
     * @default
     * @type {cssColor}
     * @memberOf module:defaults
     */
    columnHeaderBackgroundColor: 'rgb(223, 227, 232)',

    /**
     * @default
     * @type {cssColor}
     * @memberOf module:defaults
     */
    columnHeaderForegroundSelectionColor: 'rgb(80, 80, 80)',

    /**
     * @default
     * @type {cssColor}
     * @memberOf module:defaults
     */
    columnHeaderBackgroundSelectionColor: 'rgba(255, 220, 97, 0.45)',

    /**
     * @default
     * @type {string}
     * @memberOf module:defaults
     */
    columnHeaderHalign: 'center',

    /**
     * @default
     * @type {string}
     * @memberOf module:defaults
     */
    columnHeaderRenderer: 'SimpleCell',


    /********** SECTION: ROW HEADER COLORS **********/

    /**
     * @default
     * @type {cssFont}
     * @memberOf module:defaults
     */
    rowHeaderFont: '12px Tahoma, Geneva, sans-serif',

    /**
     * @default
     * @type {cssColor}
     * @memberOf module:defaults
     */
    rowHeaderColor: 'rgb(25, 25, 25)',

    /**
     * @default
     * @type {cssColor}
     * @memberOf module:defaults
     */
    rowHeaderBackgroundColor: 'rgb(223, 227, 232)',

    /**
     * @default
     * @type {cssColor}
     * @memberOf module:defaults
     */
    rowHeaderForegroundSelectionColor: 'rgb(80, 80, 80)',

    /**
     * Font style for selected rows' headers.
     * @default
     * @type {string}
     * @memberOf module:defaults
     */
    rowHeaderForegroundSelectionFont: 'bold 12px Tahoma, Geneva, sans-serif',

    /**
     * @default
     * @type {cssColor}
     * @memberOf module:defaults
     */
    rowHeaderBackgroundSelectionColor: 'rgba(255, 220, 97, 0.45)',
    /**
     * @default
     * @type {cssColor}
     * @memberOf module:defaults
     */
    backgroundColor2: 'rgb(201, 201, 201)',


    /********** SECTION: TREE HEADER COLORS **********/

    /**
     * @default
     * @type {cssFont}
     * @memberOf module:defaults
     */
    treeHeaderFont: '12px Tahoma, Geneva, sans-serif',

    /**
     * @default
     * @type {cssColor}
     * @memberOf module:defaults
     */
    treeHeaderColor: 'rgb(25, 25, 25)',

    /**
     * @default
     * @type {cssColor}
     * @memberOf module:defaults
     */
    treeHeaderBackgroundColor: 'rgb(223, 227, 232)',

    /**
     * @default
     * @type {cssColor}
     * @memberOf module:defaults
     */
    treeHeaderForegroundSelectionColor: 'rgb(80, 80, 80)',

    /**
     * Font style for selected rows' headers.
     * @default
     * @type {string}
     * @memberOf module:defaults
     */
    treeHeaderForegroundSelectionFont: 'bold 12px Tahoma, Geneva, sans-serif',

    /**
     * @default
     * @type {cssColor}
     * @memberOf module:defaults
     */
    treeHeaderBackgroundSelectionColor: 'rgba(255, 220, 97, 0.45)',
    /********** SECTION: FILTER ROW COLORS **********/

    /**
     * @default
     * @type {cssFont}
     * @memberOf module:defaults
     */
    filterFont: '12px Tahoma, Geneva, sans-serif',

    /**
     * @default
     * @type {cssColor}
     * @memberOf module:defaults
     */
    filterColor: 'rgb(25, 25, 25)',

    /**
     * @default
     * @type {cssColor}
     * @memberOf module:defaults
     */
    filterBackgroundColor: 'white',

    /**
     * @default
     * @type {cssColor}
     * @memberOf module:defaults
     */
    filterForegroundSelectionColor: 'rgb(25, 25, 25)',

    /**
     * @default
     * @type {cssColor}
     * @memberOf module:defaults
     */
    filterBackgroundSelectionColor: 'rgb(255, 220, 97)',

    /**
     * @default
     * @type {string}
     * @memberOf module:defaults
     */
    filterHalign: 'center',

    /**
     * @default
     * @type {string}
     * @memberOf module:defaults
     */
    filterRenderer: 'SimpleCell',

    /**
     * @default
     * @type {boolean}
     * @memberOf module:defaults
     */
    filterable: true,

    /**
     * @default
     * @type {boolean}
     * @memberOf module:defaults
     */
    showFilterRow: false,

    /**
     * @default
     * @type {number}
     * @memberOf module:defaults
     */
    voffset: 0,

    /**
     * @default
     * @type {string}
     * @memberOf module:defaults
     */
    scrollbarHoverOver: 'visible',

    /**
     * @default
     * @type {string}
     * @memberOf module:defaults
     */
    scrollbarHoverOff: 'hidden',

    /**
     * @default
     * @type {boolean}
     * @memberOf module:defaults
     */
    scrollingEnabled: true,

    /**
     * @default
     * @type {string}
     * @memberOf module:defaults
     */
    vScrollbarClassPrefix: '',

    /**
     * @default
     * @type {string}
     * @memberOf module:defaults
     */
    hScrollbarClassPrefix: '',

    /**
     * @default
     * @type {string}
     * @memberOf module:defaults
     */
    halign: 'center',

    /**
     * Padding to left and right of cell value.
     *
     * NOTE: Right padding may not be visible if column is not sized wide enough.
     *
     * See also {@link module:defaults.iconPadding|iconPadding}.
     * @default
     * @type {number}
     * @memberOf module:defaults
     */
    cellPadding: 5,

    /**
     * Padding to left and right of cell icons.
     *
     * Overrides {@link module:defaults.cellPadding|cellPadding}:
     * * Left icon + `iconPadding` overrides left {@link module:defaults.cellPddingg|cellPddingg}.
     * * Right icon + `iconPadding` overrides right {@link module:defaults.cellPddingg|cellPddingg}.
     * @see {@link module:defaults.leftIcon|leftIcon}
     * @see {@link module:defaults.centerIcon|centerIcon}
     * @see {@link module:defaults.rightIcon|rightIcon}
     * @default
     * @type {number}
     * @memberOf module:defaults
     */
    iconPadding: 3,

    /**
     * @summary Name of image to appear at right of cell.
     * Must be a key from {@link module:images|images}.
     * @desc Used by {@link SimpleCell} cell renderer.
     * @see {@link module:defaults.centerIcon|centerIcon}
     * @see {@link module:defaults.rightIcon|rightIcon}
     * @see {@link module:defaults.iconPadding|iconPadding}
     * @default
     * @type {string}
     * @memberOf module:defaults
     */
    leftIcon: undefined,

    /**
     * @summary Name of image to appear at right of cell.
     * Must be a key from {@link module:images|images}.
     * @desc Used by {@link SimpleCell} cell renderer.
     * @see {@link module:defaults.leftIcon|leftIcon}
     * @see {@link module:defaults.rightIcon|rightIcon}
     * @see {@link module:defaults.iconPadding|iconPadding}
     * @default
     * @type {string}
     * @memberOf module:defaults
     */
    centerIcon: undefined,

    /**
     * @summary Name of image to appear at right of cell.
     * Must be a key from {@link module:images|images}.
     * @desc Used by {@link SimpleCell} cell renderer.
     * @see {@link module:defaults.leftIcon|leftIcon}
     * @see {@link module:defaults.centerIcon|centerIcon}
     * @see {@link module:defaults.iconPadding|iconPadding}
     * @default
     * @type {string}
     * @memberOf module:defaults
     */
    rightIcon: undefined,

    /**
     * Set to `true` to render `0` and `false`. Otherwise these value appear as blank cells.
     * @default
     * @type {boolean}
     * @memberOf module:defaults
     */
    renderFalsy: false,

    /**
     * @default
     * @type {boolean}
     * @memberOf module:defaults
     */
    gridLinesH: true,

    /** @type {number}
     * @default
     * @memberOf module:defaults
     * @see {@link module:dynamicPropertyDescriptors.lineWidth}
     */
    gridLinesHWidth: 1,

    /** @type {string}
     * @default
     * @memberOf module:defaults
     * @see {@link module:dynamicPropertyDescriptors.lineColor}
     */
    gridLinesHColor: 'rgb(199, 199, 199)',

    /**
     * @default
     * @type {boolean}
     * @memberOf module:defaults
     */
    gridLinesV: true,

    /** @type {number}
     * @default
     * @memberOf module:defaults
     * @see {@link module:dynamicPropertyDescriptors.lineWidth}
     */
    gridLinesVWidth: 1,

    /** @type {string}
     * @default
     * @memberOf module:defaults
     * @see {@link module:dynamicPropertyDescriptors.lineColor}
     */
    gridLinesVColor: 'rgb(199, 199, 199)',

    /**
     * Set canvas's CSS border to this string as well as `gridBorderLeft`, `gridBorderRight`, `gridBorderTop`, and `gridBorderBottom`.
     * If set to `true`, uses current `lineWidth` and `lineColor`.
     * If set to `false`, uses null.
     *
     * Caveat: The use of `grid.canvas.canvas.style.boxSizing = 'border-box'` is _not_ recommended due to
     * the fact that the canvas is squashed slightly to accommodate the border resulting in blurred text.
     *
     * @default
     * @type {boolean|string}
     * @memberOf module:defaults
     */
    gridBorder: false,

    /**
     * Set canvas's left CSS border to this string.
     * If set to `true`, uses current `lineWidth` and `lineColor`.
     * If set to `false`, uses null.
     * @default
     * @type {boolean|string}
     * @memberOf module:defaults
     */
    gridBorderLeft: false,

    /**
     * Set canvas's right CSS border to this string.
     * If set to `true`, uses current `lineWidth` and `lineColor`.
     * If set to `false`, uses null.
     * @default
     * @type {boolean}
     * @memberOf module:defaults
     */
    gridBorderRight: false,

    /**
     * Set canvas's top CSS border to this string.
     * If set to `true`, uses current `lineWidth` and `lineColor`.
     * If set to `false`, uses null.
     * @default
     * @type {boolean}
     * @memberOf module:defaults
     */
    gridBorderTop: false,

    /**
     * Set canvas's bottom CSS border to this string.
     * If set to `true`, uses current `lineWidth` and `lineColor`.
     * If set to `false`, uses null.
     * @default
     * @type {boolean}
     * @memberOf module:defaults
     */
    gridBorderBottom: true,

    /**
     * Define this property to style rule lines between fixed & scolling rows differently from `lineWidth`.
     * @default
     * @type {number}
     * @memberOf module:defaults
     */
    fixedLinesHWidth: 2,

    /**
     * Define this property to render just the edges of the lines between fixed & scolling rows, creating a double-line effect. The value is the thickness of the edges. Typical definition would be `1` in tandem with setting `fixedLinesWidth` to `3`.
     * @default
     * @type {number}
     * @memberOf module:defaults
     */
    fixedLinesHEdge: undefined, // undefined means no edge effect

    /**
     * Define this property to style rule lines between fixed & scolling rows differently from `lineColor`.
     * @default
     * @type {cssColor}
     * @memberOf module:defaults
     */
    fixedLinesHColor: 'rgb(164,164,164)', // ~21% darker than `lineColor` default

    /**
     * Define this property to style rule lines between fixed & scolling columns differently from `lineWidth`.
     * @default
     * @type {number}
     * @memberOf module:defaults
     */
    fixedLinesVWidth: 2,

    /**
     * Define this property to render just the edges of the lines between fixed & scolling columns, creating a double-line effect. The value is the thickness of the edges. Typical definition would be `1` in tandem with setting `fixedLinesWidth` to `3`.
     * @default
     * @type {number}
     * @memberOf module:defaults
     */
    fixedLinesVEdge: undefined, // undefined means no edge effect

    /**
     * Define this property to style rule lines between fixed & scolling columns differently from `lineColor`.
     * @default
     * @type {cssColor}
     * @memberOf module:defaults
     */
    fixedLinesVColor: 'rgb(164,164,164)', // ~21% darker than `lineColor` default

    /**
     * @default
     * @type {number}
     * @memberOf module:defaults
     */
    defaultRowHeight: 15,

    /**
     * @default
     * @type {number}
     * @memberOf module:defaults
     */
    defaultColumnWidth: 100,

    /**
     * @default
     * @type {number}
     * @memberOf module:defaults
     */
    minimumColumnWidth: 5,

    //for immediate painting, set these values to 0, true respectively

    /**
     * @default
     * @type {number}
     * @memberOf module:defaults
     */
    repaintIntervalRate: 60,

    /**
     * @default
     * @type {boolean}
     * @memberOf module:defaults
     */
    repaintImmediately: false,

    //enable or disable double buffering

    /**
     * @default
     * @type {boolean}
     * @memberOf module:defaults
     */
    useBitBlit: false,


    /**
     * @default
     * @type {boolean}
     * @memberOf module:defaults
     */
    useHiDPI: true,

    /**
     * @summary Mappings for cell navigation keys.
     * @desc Cell navigation is handled in the {@link CellSelection} "feature". This property gives you control over which keypresses the built-in mechanism will respond to.
     *
     * (If this built-in cell selection logic is insufficient for your needs, you can also listen for the various "fin-key" events and carry out more complex operations in your listeners.)
     *
     * The keypress names used here are defined in Canvas.js. Note that all keypresses actually have two names, a normal name and a shifted name. The latter name is used when either **shift** is depressed.
     *
     * The built-in nav keypresses are as follows:
     * * **`UP`** _(up-arrow key)_ - Replace all selections with a single cell, one row up from the last selection.
     * * **`DOWN`** _(down-arrow key)_ - Replace all selections with a single cell, one row down from the last selection.
     * * **`LEFT`** _(left-arrow key)_ - Replace all selections with a single cell, one column to the left of the last selection.
     * * **`RIGHT`** _(right-arrow key)_ - Replace all selections with a single cell, one column to the right of the last selection.
     * * **`UPSHIFT`** _(shift + up-arrow)_ - Extend the last selection up one row.
     * * **`DOWNSHIFT`** _(shift + down-arrow)_ - Extend the last selection down one row.
     * * **`LEFTSHIFT`** _(shift + left-arrow)_ - Extend the last selection left one column.
     * * **`RIGHTSHIFT`** _(shift + right-arrow)_ - Extend the last selection right one column.
     *
     * To alter these or add other mappings see the examples below.
     *
     * A note regarding the other meta keys (**trl**, **option**, and **command**): Although these meta keys can be detected, they do not modify the key names as **shift** does. This is because they are more for system use and generally (with the possibly exception fo **ctrl**) should not be depended upon, as system functions will take priority and your app will never see these key presses.
     *
     * A special accommodation has been made to the {@link module:defaults.editOnKeydown|editOnKeydown} property:
     * * If `editOnKeydown` truthy AND mapped character is an actual (non-white-space) character (as opposed to say **tab** or **return**), then navigation requires **ctrl** key to distinguish between nav and data.
     * * If `editOnKeydown` falsy, the **ctrl** key is ignored.
     *
     * So in the last example, if `editOnKeydown` is ON, then `a` (without **ctrl**) would start editing the cell and **ctrl** + `a` would move the selection one column to the left.
     *
     * @example
     * // To void the above build-ins:
     * navKeyMap: {
     *     UP: undefined,
     *     UPSHIFT: undefined,
     *     DOWN: undefined,
     *     ...
     * }
     *
     * @example
     * // To map alternative nav keypresses to RETURN and TAB (default mapping):
     * navKeyMap: {
     *     RETURN: 'DOWN',
     *     RETURNSHIFT: 'UP',
     *     TAB: 'RIGHT',
     *     TABSHIFT: 'LEFT'
     * }
     *
     * @example
     * // To map alternative nav keypresses to a/w/d/s and extend select to A/W/D/S:
     * navKeyMap: {
     *     a: 'LEFT', A: 'LEFTSHIFT',
     *     w: 'UP', W: 'UPSHIFT',
     *     s: 'DOWN', S: 'DOWNSHIFT',
     *     d: 'RIGHT', D: 'RIGHTSHIFT'
     * }
     *
     * @default
     * @type {object|undefined}
     * @memberOf module:defaults
     */
    navKeyMap: {
        RETURN: 'DOWN',
        RETURNSHIFT: 'UP',
        TAB: 'RIGHT',
        TABSHIFT: 'LEFT'
    },

    /**
     * Returns any value of `keyChar` that passes the following logic test:
     * 1. If a non-printable, white-space character, then nav key.
     * 2. If not (i.e., a normal character), can still be a nav key if not editing on key down.
     * 3. If not, can still be a nav key if CTRL key is down.
     *
     * Note: Callers are typcially only interested in the following values of `keyChar` and will ignore all others:
     * * `'LEFT'` and `'LEFTSHIFT'`
     * * `'RIGHT'` and `'RIGHTSHIFT'`
     * * `'UP'` and `'UPSHIFT'`
     * * `'DOWN'` and `'DOWNSHIFT'`
     *
     * @param {string} keyChar - A value from Canvas's `charMap`.
     * @param {boolean} [ctrlKey=false] - The CTRL key was down.
     * @returns {undefined|string} `undefined` means not a nav key; otherwise returns `keyChar`.
     * @memberOf module:defaults
     */
    navKey: function(keyChar, ctrlKey) {
        var result;
        if (keyChar.length > 1 || !this.editOnKeydown || ctrlKey) {
            result = keyChar; // return the mapped value
        }
        return result;
    },

    /**
     * Returns only values of `keyChar` that, when run through {@link module:defaults.navKeyMap|navKeyMap}, pass the {@link module:defaults.navKey|navKey} logic test.
     *
     * @param {string} keyChar - A value from Canvas's `charMap`, to be remapped through {@link module:defaults.navKeyMap|navKeyMap}.
     * @param {boolean} [ctrlKey=false] - The CTRL key was down.
     * @returns {undefined|string} `undefined` means not a nav key; otherwise returns `keyChar`.
     * @memberOf module:defaults
     */
    mappedNavKey: function(keyChar, ctrlKey) {
        keyChar = this.navKeyMap[keyChar];
        return keyChar && this.navKey(keyChar);
    },

    /** @summary Validation failure feedback.
     * @desc Validation occurs on {@link CellEditor#stopEditing}, normally called on commit (`TAB`, `ENTER`, or any other keys listed in `navKeyMap`).
     *
     * On successful validation, the value is saved back to the data source and the editor is closed.
     *
     * On validation failure, feedback is shown to the user in the form of an "error effect" possibly followed by an "end effect" containing a detailed explanation.
     *
     * The error effect to use is named in `feedbackEffect
     *
     * The value of this property is the number of times to show the "error effect" on validation failure before showing the detailed explanation.
     *
     * `feedback` may be set to one of:
     * * **`undefined`** - Do not show the error effect or the alert. Just discard the value and close the editor (as if `ESC` had been typed).
     * * **`0`** - Just shows the error feedback effect (see the {@link CellEditor#errorEffect|errorEffect} property).
     * * **`1`** - Shows the error feedback effect followed by the detailed explanation.
     * * `2` or more:
     *   1. Shows the error feedback effect
     *   2. On every `feedback` tries, shows the detailed explanation.
     * @default
     * @type {number|undefined}
     * @memberOf module:defaults
     */
    feedbackCount: 3,

    /**
     * @default
     * @type {{name:string,options:object}|string}
     * @memberOf module:defaults
     */
    feedbackEffect: 'shaker',

    /**
     * @default
     * @type {boolean}
     * @memberOf module:defaults
     */
    readOnly: false,

    /**
     * @summary Execute value if "calculator" (function) or if column has calculator.
     * @desc This function is referenced here so:
     * 1. it will be available to the cell renderers.
     * 2. Its context will naturally be the `config` object
     * @default {@link module:defaults.exec|exec}
     * @type {function}
     * @memberOf module:defaults
     */
    exec: exec,

    /**
     * @default
     * @type {number}
     * @memberOf module:defaults
     */
    fixedColumnCount: 0,

    /**
     * @default
     * @type {number}
     * @memberOf module:defaults
     */
    fixedRowCount: 0,

    /**
     * @default
     * @type {boolean}
     * @memberOf module:defaults
     * @see {@link module:dynamicPropertyDescriptors.showRowNumbers}
     */
    rowHeaderNumbers: true,

    /**
     * @default
     * @type {boolean}
     * @memberOf module:defaults
     * @see {@link module:dynamicPropertyDescriptors.showRowNumbers}
     */
    rowHeaderCheckboxes: true,

    /**
     * @default
     * @type {boolean}
     * @memberOf module:defaults
     */
    showTreeColumn: true,

    /**
     * @default
     * @type {string}
     * @memberOf module:defaults
     */
    treeRenderer: 'SimpleCell',

    /**
     * @default
     * @type {boolean}
     * @memberOf module:defaults
     */
    showHeaderRow: true,

    /** Clicking in a cell "selects" it; it is added to the select region and repainted with "cell selection" colors.
     * @default
     * @type {boolean}
     * @memberOf module:defaults
     */
    cellSelection: true,

    /** Clicking in a column header (top row) "selects" the column; the entire column is added to the select region and repainted with "column selection" colors.
     * @default
     * @type {boolean}
     * @memberOf module:defaults
     */
    columnSelection: true,

    /** Clicking in a row header (leftmost column) "selects" the row; the entire row is added to the select region and repainted with "row selection" colors.
     * @default
     * @type {boolean}
     * @memberOf module:defaults
     */
    rowSelection: true,

    /**
     * @default
     * @type {boolean}
     * @memberOf module:defaults
     */
    singleRowSelectionMode: true,

    /**
     * @summary Fill color for last selection overlay.
     * @desc The color should be translucent (or transparent). Note that "Partial" grid renderers (such as the {@link paintCellsAsNeeded} renderer) do not draw overlay because it just gets darker and darker for non-updated cells.
     * @default
     * @type {cssColor}
     * @memberOf module:defaults
     */
    selectionRegionOverlayColor: 'transparent', // 'rgba(0, 0, 48, 0.2)',

    /**
     * @summary Stroke color for last selection overlay.
     * @default
     * @type {string}
     * @memberOf module:defaults
     */
    selectionRegionOutlineColor: 'rgb(69, 69, 69)',

    /**
     * @default
     * @type {boolean}
     * @memberOf module:defaults
     */
    columnAutosizing: true,

    /**
     * @default
     * @type {boolean}
     * @memberOf module:defaults
     */
    rowNumberAutosizing: true,

    /**
     * @default
     * @type {boolean}
     * @memberOf module:defaults
     */
    headerTextWrapping: false,

    /**
     * @default
     * @type {boolean}
     * @memberOf module:defaults
     */
    rowResize: false,


    /* CELL EDITING */

    /**
     * @default
     * @type {boolean}
     * @memberOf module:defaults
     */
    editable: true,

    /**
     * Edit cell on double-click rather than single-click.
     *
     * @default
     * @type {boolean}
     * @memberOf module:defaults
     */
    editOnDoubleClick: true,

    /**
     * Grid-level property.
     * When user presses a "printable" keyboard character _or_ BACKSPACE _or_ DELETE:
     * 1. Activate cell editor on current cell (i.e., origin of most recent selection).
     * 2. If cell editor is a text editor:
     *    1. Replace current value with the character the user typed; or
     *    2. Clear it on BACKSPACE, DELETE, or other invalid character (_e.g._ when user types a letter but the cell editor only accepts digits).
     *
     * > In invoked, user has the option to back out by pressing the ESCAPE key.
     *
     * @default
     * @type {boolean}
     * @memberOf module:defaults
     */
    editOnKeydown: true,

    /**
     * @summary Open cell editor when cell selected via keyboard navigation.
     * @desc Keyboard navigation always includes:
     * 1. The four arrow keys -- but only when there is no active text cell editor open
     * 2. Additional keys mapped to the four directs in {@link module:defaults.navKeyMap}
     *
     * Generally set at the grid level. If set at the column (or cell) level, note that the property pertains to the cell navigated _to,_ not the cell navigated _away from._
     * @default
     * @type {boolean}
     * @memberOf module:defaults
     */
    editOnNextCell: false,


    /* COLUMN SORTING */

    /**
     * Ignore sort handling in feature/ColumnSorting.js.
     * Useful for excluding some columns but not other from participating in sorting.
     *
     * @default
     * @type {boolean}
     * @memberOf module:defaults
     */
    unsortable: false,

    /**
     * Sort column on double-click rather than single-click.
     *
     * Used by:
     * * feature/ColumnSorting.js to decide which event to respond to (if any, see `unsortabe`).
     * * feature/ColumnSelection.js to decide whether or not to wait for double-click.
     * @default
     * @type {boolean}
     * @memberOf module:defaults
     */
    sortOnDoubleClick: true,

    /**
     * **This is a standard property definition for sort plug-in use.
     * It is not referenced in core.**
     *
     * The maximum number of columns that may participate in a multi-column sort (via ctrl-click headers).
     * @default
     * @type {number}
     * @memberOf module:defaults
     */
    maxSortColumns : 3,

    /**
     * **This is a standard property definition for sort plug-in use.
     * It is not referenced in core.**
     *
     * Column(s) participating and subsequently hidden still affect sort.
     *
     * @default
     * @type {boolean}
     * @memberOf module:defaults
     */
    sortOnHiddenColumns: true,


    /**
     * @summary Retain row selections.
     * @desc When falsy, row selections are cleared when selecting cells; when truthy, row selections are kept as is when selecting cells.
     * @todo Deprecate in favor of something simpler like `keepRowSelections`. (The current name is misleading and has caused some confusion among both developers and users. At the very least it should have been called `checkboxOnlyRowDeselections`.)
     * @default
     * @type {boolean}
     * @memberOf module:defaults
     */
    checkboxOnlyRowSelections: false,

    /**
     * @summary Select cell's entire row.
     * @desc When truthy, selecting a cell will also select the entire row it is in, subject to note #1 below.
     *
     * Notes:
     * 1. Ineffectual unless `checkboxOnlyRowSelections` is set to `false`.
     * 2. To allow auto-selection of _multiple rows,_ set `singleRowSelectionMode` to `false`.
     *
     * @default
     * @type {boolean}
     * @memberOf module:defaults
     */
    autoSelectRows: false,

    /**
     * @summary Select cell's entire column.
     * @desc When truthy, selecting a cell will also select the entire column it is in.
     * @default
     * @type {boolean}
     * @memberOf module:defaults
     */
    autoSelectColumns: false,

    /** @summary Name of a formatter for cell text.
     * @desc The default (`undefined`) falls back to `column.type`.
     * The value `null` does no formatting.
     * @default undefined
     * @type {undefined|null|string}
     * @memberOf module:defaults
     * @tutorial localization
     */
    format: undefined,

    /** @summary Name of a cell editor from the {@link module:cellEditors|cellEditors API}..
     * @desc Not editable if named editor is does not exist.
     * @default undefined
     * @type {undefined|null|string}
     * @memberOf module:defaults
     * @tutorial cell-editors
     */
    editor: undefined,

    /**
     * Name of cell renderer from the {@link module:cellRenderers|cellRenderers API}.
     * @default
     * @type {string}
     * @memberOf module:defaults
     */
    renderer: 'SimpleCell',

    /**
     * Name of grid renderer.
     * Renderer must have been registered.
     * @see {@link Renderer#registerGridRenderer}.
     * @default
     * @type {string}
     * @memberOf module:defaults
     */
    gridRenderer: 'by-columns-and-rows',

    /********** HOVER COLORS **********/

    /** @typedef hoverColors
     * @property {boolean} [enable=false] - `false` means not hilite on hover
     * @property {cssColor} backgroundColor - cell, row, or column background color. Alpha channel will be respected and if given will be painted over the cells predetermined color.
     * @property {cssColor} [header.backgroundColor=backgroundColor] - for columns and rows, this is the background color of the column or row "handle" (header rows or columns, respectively). (Not used for cells.)
     */

    /** On mouse hover, whether to repaint the cell background and how.
     * @type {hoverColors}
     * @default '{ enabled: true, background: rgba(160, 160, 40, 0.30) }'
     * @memberOf module:defaults
     */
    hoverCellHighlight: {
        enabled: true,
        backgroundColor: 'rgba(160, 160, 40, 0.45)'
    },

    /** On mouse hover, whether to repaint the row background and how.
     * @type {hoverColors}
     * @default '{ enabled: true, background: rgba(100, 100, 25, 0.15) }'
     * @memberOf module:defaults
     */
    hoverRowHighlight: {
        enabled: true,
        backgroundColor: 'rgba(100, 100, 25, 0.30)'

    },

    /** On mouse hover, whether to repaint the column background and how.
     * @type {hoverColors}
     * @default '{ enabled: true, background: rgba(60, 60, 15, 0.15) }'
     * @memberOf module:defaults
     */
    hoverColumnHighlight: {
        enabled: true,
        backgroundColor: 'rgba(60, 60, 15, 0.15)'
    },

    /** @summary Display cell value as a link (with underline).
     * @desc One of:
     * * `boolean` - No action occurs on click; you would need to attach a 'fin-click' listener to the hypergrid object.
     *   * `true` - Displays the cell as a link.
     *   * _falsy_ - Displays the cell normally.
     * * `string` -  The URL is decorated (see {}) and then opened in a separate window/tab. See also {@link module:defaults.linkTarget|linkTarget}.
     *   * `'*'` - Use the cell value as the URL, ready for decorating (see {CellClick#openLink|openLink)).
     *   * _field name_ - Fetches the string from the named field in the same row, assumed to be a URL ready for decorating. (May contain only alphanumerics and underscore; no spaces or other punctuation.)
     *   * _otherwise_ Assumed to contains a URL ready for decorating.
     * * `function` - A function to execute to get the URL ready for decorating. The function is passed a single parameter, `cellEvent`, from which you can get the field `name`, `dataRow`, _etc._
     * * `Array` - An array to "apply" to {@link https://developer.mozilla.org/docs/Web/API/Window/open window.open} in its entirety. The first element is interpreted as above for `string` or `function`.
     *
     * In the case of `string` or `Array`, the link is further unpacked by {@link module:CellClick.openLink|openLink} and then sent to `grid.windowOpen`.
     *
     * @example
     * // following affect upper-left data cell:
     * grid.behavior.setCellProperty(0, 0, 'https://nytimes.com'); // absolute address using specific protocol
     * grid.behavior.setCellProperty(0, 0, '//nytimes.com'); // absolute address using current protocol
     * grid.behavior.setCellProperty(0, 0, '/page2.com'); // relative to current site
     * grid.behavior.setCellProperty(0, 0, 'mypage.com'); // relative to current page
     * grid.behavior.setCellProperty(0, 0, 'mypage.com?id=%value'); // cell's value will replace %value
     * grid.behavior.setCellProperty(0, 0, ['//www.newyorker.com', 'ny', undefined, true]) // target='ny', replace=true
     * @type {boolean|string|Array}
     * @type {boolean}
     * @default
     * @memberOf module:defaults
     */
    link: false,

    /** @summary The window (or tab) in which to open the link.
     * @desc The default ('_blank'`) will open a new window for every click.
     *
     * To have the first click open a new window and all subsequent clicks reuse that same window, set this to an arbitrary string.
     *
     * Otherwise, specific columns or cells can be set to open their links in their own window by setting the appropriate column's or cell's `linkTarget` property.
     * @default
     * @memberOf module:defaults
     */
    linkTarget: '_blank',

    /** @summary Underline link on hover only.
     * @type {boolean}
     * @default
     * @memberOf module:defaults
     */
    linkOnHover: false,

    /** @summary Color for link.
     * @desc Falsy means defer to foreground color.
     * @type {string}
     * @default
     * @memberOf module:defaults
     */
    linkColor: 'blue',

    /** @summary Color for visited link.
     * @desc Falsy means defer to foreground color.
     * @type {string}
     * @default
     * @memberOf module:defaults
     */
    linkVisitedColor: 'purple',

    /** @summary Color link on hover only.
     * @type {boolean}
     * @default
     * @memberOf module:defaults
     */
    linkColorOnHover: false,

    /** Display cell font with strike-through line drawn over it.
     * @type {boolean}
     * @default
     * @memberOf module:defaults
     */
    strikeThrough: false,

    /** Allow multiple cell region selections.
     * @type {boolean}
     * @default
     * @memberOf module:defaults
     */
    multipleSelections: false,

    /** @summary Re-render grid at maximum speed.
     * @desc In this mode:
     * * The "dirty" flag, set by calling `grid.repaint()`, is ignored.
     * * `grid.getCanvas().currentFPS` is a measure of the number times the grid is being re-rendered each second.
     * * The Hypergrid renderer gobbles up CPU time even when the grid appears idle (the very scenario `repaint()` is designed to avoid). For this reason, we emphatically advise against shipping applications using this mode.
     * @type {boolean}
     * @default
     * @memberOf module:defaults
     */
    enableContinuousRepaint: false,

    /** @summary Allow user to move columns .
     * @desc Columns can be reordered through either of two interfaces:
     * * Column Dragging feature
     * * behavior.columns API
     * @type {boolean}
     * @default
     * @memberOf module:defaults
     */
    columnsReorderable: true,

    /** @summary Apply cell properties before `getCell`.
     * @type {boolean}
     * @default
     * @memberOf module:defaults
     */
    applyCellProperties: true,

    /** @summary Reapply cell properties after `getCell`.
     * @type {boolean}
     * @default
     * @memberOf module:defaults
     */
    reapplyCellProperties: false,

    /** @summary Column grab within this number of pixels from top of cell.
     * @type {number}
     * @default
     * @memberOf module:defaults
     */
    columnGrabMargin: 5,

    /** @summary Set up a clipping region around each column before painting cells.
     * @desc One of:
     * * `true` - Clip column.
     * * `false` - Do not clip column.
     * * `null` - Clip iff last active column.
     *
     * Clipping prevents text that overflows to the right of the cell from being rendered.
     * If you can guarantee that none of your text will overflow, turn column clipping off
     * for better performance. If not, you may still be able to get away without clipping.
     * If the background color of the next column is opaque, you don't really need to clip,
     * although text can leak out to the right of the last column. Clipping the last column
     * only can help this but not solve it since the leaked text from (say) the column before
     * the last column could stretch across the entire last column and leak out anyway.
     * The solution to this is to clip the rendered string so at most only a partial character
     * will overflow.
     * @type {boolean|undefined}
     * @default
     * @memberOf module:defaults
     */
    columnClip: true,

    /**
     * @summary Repeating pattern of property overrides for grid rows.
     * @desc Notes:
     * * "Grid row" refers to data rows.
     * * Row index modulo is applied when dereferencing this array. In other words, this array represents a _repeating pattern_ of properties to be applied to the data rows.
     * * For no row properties, specify a falsy value in place of the array.
     * * Do not specify an empty array (will throw an error).
     * * Each element of the array may be either:
     *   * An object containing property overrides to be applied to every cell of the row; or
     *   * A falsy value signifying that there are no row properties for this specific row.
     * * Caveat: Row properties use `Object.assign()` to copy properties and therefore are not as performant as column properties which use prototype chain.
     * * `Object.assign()` is a polyfill in older versions of Chrome (<45) and in all Internet Explorer (through 11).
     * @type {undefined|object[]}
     * @default
     * @memberOf module:defaults
     */
    rowStripes: undefined,

    // for Renderer.prototype.assignProps
    propClassEnum: propClassEnum,
    propClassLayers: [ propClassEnum.COLUMNS, propClassEnum.STRIPES, propClassEnum.ROWS, propClassEnum.CELLS ],

    /**
     * Used to access registered features -- unless behavior has a non-empty `features` property (array of feature contructors).
     */
    features: [
        'filters',
        'cellselection',
        'keypaging',
        'columnresizing',
        // 'rowresizing',
        'rowselection',
        'columnselection',
        'columnmoving',
        'columnsorting',
        'cellclick',
        'cellediting',
        'onhover'
    ],

    /** @summary How to truncate text.
     * @desc A "quaternary" value, one of:
     * * `undefined` - Text is not truncated.
     * * `true` (default) - Truncate sufficient characters to fit ellipsis if possible. Most acceptable option that avoids need for clipping.
     * * `false` - Truncate *before* last partially visible character. Visibly annoying; semantically jarring.
     * * `null` - Truncate *after* partially visible character. Less visibly annoying; still semantically confusing. Best solution when combined with either column clipping or painting over with next column's background.
     * @type {boolean|null|undefined}
     * @default
     * @memberOf module:defaults
     */
    truncateTextWithEllipsis: true
};

function rowPropertiesDeprecationWarning() {
    if (!warned.rowProperties) {
        warned.rowProperties = true;
        console.warn('The `rowProperties` property has been deprecated as of v2.1.0 in favor of `rowStripes`. (Will be removed in a future release.)');
    }
}

Object.defineProperty(defaults, 'rowProperties', {
    get: function() {
        rowPropertiesDeprecationWarning();
        return this.rowStripes;
    },
    set: function(rowProperties) {
        rowPropertiesDeprecationWarning();
        this.rowStripes = rowProperties;
    }
});

/** @typedef {string} cssColor
 * @see https://developer.mozilla.org/docs/Web/CSS/color_value
 */
/** @typedef {string} cssFont
 * @see https://developer.mozilla.org/docs/Web/CSS/font
 */

function exec(vf) {
    if (this.dataRow) {
        var calculator = (typeof vf)[0] === 'f' && vf || this.calculator;
        if (calculator) {
            vf = calculator(this.dataRow, this.name);
        }
    }
    return vf;
}

module.exports = defaults;

},{"./lib/error":86,"overrider":20}],63:[function(require,module,exports){
'use strict';

var Feature = require('./Feature');

/**
 * @constructor
 * @extends Feature
 */
var CellClick = Feature.extend('CellClick', {

    handleMouseMove: function(grid, event) {
        var link = event.properties.link,
            isActionableLink = link && typeof link !== 'boolean'; // actionable with truthy other than `true`

        this.cursor = isActionableLink ? 'pointer' : null;

        if (this.next) {
            this.next.handleMouseMove(grid, event);
        }
    },

    /**
     * @param {Hypergrid} grid
     * @param {CellEvent} event - the event details
     * @memberOf CellClick#
     */
    handleClick: function(grid, event) {
        var consumed = (event.isDataCell || event.isTreeColumn) && (
            this.openLink(grid, event) !== undefined ||
            grid.cellClicked(event)
        );

        if (!consumed && this.next) {
            this.next.handleClick(grid, event);
        }
    },

    /**
     * @summary Open the cell's URL.
     *
     * @desc The URL is found in the cell's {@link module:defaults.link|link} property, which serves two functions:
     * 1. **Renders as a link.** When truthy causes {@link SimpleCell} cell renderer to render the cell underlined with {@link module:defaults.linkColor|linkColor}. (See also {@link module:defaults.linkOnHover|linkOnHover} and {@link module:defaults.linkColorOnHover|linkColorOnHover}.) Therefore, setting this property to `true` will render as a link, although clicking on it will have no effect. This is useful if you wish to handle the click yourself by attaching a `'fin-click'` listener to your hypergrid.
     * 2. **Fetch the URL.** The value of the link property is interpreted as per {@link module:defaults.link|link}.
     * 3. **Decorate the URL.** The cell name (_i.e.,_ the data column name) and cell value are merged into the URL wherever the respective substrings `'%name'` and `'%value'` are found. For example, if the column name is "age" and the cell value is 6 (or a function returning 25), and the link is `'http://www.abc.com?%name=%value'`, then the actual link (first argument given to `grid.windowOpen`) would be `'http://www.abc.com?age=25'`.
     * 4. **Open the URL.** The link is then opened by {@link Hypergrid#windowOpen|grid.windowOpen}. If `link` is an array, it is "applied" to `grid.windowOpen` in its entirety; otherwise, `grid.windowOpen` is called with the link as the first argument and {@link module:defaults.linkTarget|linkTarget} as the second.
     * 5. **Decorate the link.** On successful return from `windowOpen()`, the text is colored as "visited" as per the cell's {@link module:defaults.linkVisitedColor|linkVisitedColor} property (by setting the cell's `linkColor` property to its `linkVisitedColor` property).

     * @param {Hypergrid} grid
     * @param {CellEvent} cellEvent - Event details.
     *
     * @returns {boolean|window|null|undefined} One of:
     *
     * | Value | Meaning |
     * | :---- | :------ |
     * | `undefined` | no link to open |
     * | `null` | `grid.windowOpen` failed to open a window |
     * | _otherwise_ | A `window` reference returned by a successful call to `grid.windowOpen`. |
     *
     * @memberOf CellClick#
     */
    openLink: function(grid, cellEvent) {
        var result, url,
            dataRow = cellEvent.dataRow,
            config = Object.create(cellEvent.properties, { dataRow: { value: dataRow } }),
            value = config.exec(cellEvent.value),
            linkProp = cellEvent.properties.link,
            isArray = linkProp instanceof Array,
            link = isArray ? linkProp[0] : linkProp;

        // STEP 2: Fetch the URL
        switch (typeof link) {
            case 'string':
                if (link === '*') {
                    url = value;
                } else if (/^\w+$/.test(link)) {
                    url = dataRow[link];
                }
                break;

            case 'function':
                url = link(cellEvent);
                break;
        }

        if (url) {
            // STEP 3: Decorate the URL
            url = url.toString().replace(/%name/g, config.name).replace(/%value/g, value);

            // STEP 4: Open the URL
            if (isArray) {
                linkProp = linkProp.slice();
                linkProp[0] = url;
                result = grid.windowOpen.apply(grid, linkProp);
            } else {
                result = grid.windowOpen(url, cellEvent.properties.linkTarget);
            }
        }

        // STEP 5: Decorate the link as "visited"
        if (result) {
            cellEvent.setCellProperty('linkColor', grid.properties.linkVisitedColor);
            grid.renderer.resetCellPropertiesCache(cellEvent);
            grid.repaint();
        }

        return result;
    }

});

module.exports = CellClick;

},{"./Feature":70}],64:[function(require,module,exports){
'use strict';

var Feature = require('./Feature');
var CellEditor = require('../cellEditors/CellEditor');

/**
 * @constructor
 * @extends Feature
 */
var CellEditing = Feature.extend('CellEditing', {

    /**
     * @memberOf CellEditing.prototype
     * @param {Hypergrid} grid
     * @param {Object} event - the event details
     */
    handleDoubleClick: function(grid, event) {
        edit.call(this, grid, event);
    },

    handleClick: function(grid, event) {
        edit.call(this, grid, event, true);
    },

    /**
     * @param {Hypergrid} grid
     * @param {Object} event - the event details
     * @memberOf KeyPaging.prototype
     */
    handleKeyDown: function(grid, event) {
        var char, isVisibleChar, isDeleteChar, editor, cellEvent;

        if (
            (cellEvent = grid.getGridCellFromLastSelection()) &&
            cellEvent.properties.editOnKeydown &&
            !grid.cellEditor &&
            (
                (char = event.detail.char) === 'F2' ||
                (isVisibleChar = char.length === 1 && !(event.detail.meta || event.detail.ctrl)) ||
                (isDeleteChar = char === 'DELETE' || char === 'BACKSPACE')
            )
        ) {
            editor = grid.onEditorActivate(cellEvent);

            if (editor instanceof CellEditor) {
                if (isVisibleChar) {
                    editor.input.value = char;
                } else if (isDeleteChar) {
                    editor.setEditorValue('');
                }
                event.detail.primitiveEvent.preventDefault();
            }
        } else if (this.next) {
            this.next.handleKeyDown(grid, event);
        }
    }

});

// Note: Keep ! in place to convert both sides to bool for
// accurate equality test because either could be undefined.
function edit(grid, event, onDoubleClick) {
    if (
        event.isDataCell &&
        !event.getCellProperty('editOnDoubleClick') === !onDoubleClick // caution see note
    ) {
        grid.onEditorActivate(event);
    }

    if (this.next) {
        this.next[onDoubleClick ? 'handleDoubleClick' : 'handleClick'](grid, event);
    }
}

module.exports = CellEditing;

},{"../cellEditors/CellEditor":39,"./Feature":70}],65:[function(require,module,exports){
'use strict';

var Feature = require('./Feature');

/**
 * @constructor
 * @extends Feature
 */
var CellSelection = Feature.extend('CellSelection', {

    /**
     * The pixel location of the mouse pointer during a drag operation.
     * @type {Point}
     * @memberOf CellSelection.prototype
     */
    currentDrag: null,

    /**
     * the cell coordinates of the where the mouse pointer is during a drag operation
     * @type {Object}
     * @memberOf CellSelection.prototype
     */
    lastDragCell: null,

    /**
     * a millisecond value representing the previous time an autoscroll started
     * @type {number}
     * @default 0
     * @memberOf CellSelection.prototype
     */
    sbLastAuto: 0,

    /**
     * a millisecond value representing the time the current autoscroll started
     * @type {number}
     * @default 0
     * @memberOf CellSelection.prototype
     */
    sbAutoStart: 0,

    /**
     * @memberOf CellSelection.prototype
     * @param {Hypergrid} grid
     * @param {Object} event - the event details
     */
    handleMouseUp: function(grid, event) {
        if (this.dragging) {
            this.dragging = false;
        }
        if (this.next) {
            this.next.handleMouseUp(grid, event);
        }
    },

    /**
     * @memberOf CellSelection.prototype
     * @param {Hypergrid} grid
     * @param {Object} event - the event details
     */
    handleMouseDown: function(grid, event) {
        var dx = event.gridCell.x,
            dy = event.dataCell.y,
            isSelectable = grid.behavior.getCellProperty(event.dataCell.x, event.gridCell.y, 'cellSelection');

        if (isSelectable && event.isDataCell && !event.primitiveEvent.detail.isRightClick) {
            var dCell = grid.newPoint(dx, dy),
                primEvent = event.primitiveEvent,
                keys = primEvent.detail.keys;
            this.dragging = true;
            this.extendSelection(grid, dCell, keys);
        } else if (this.next) {
            this.next.handleMouseDown(grid, event);
        }
    },

    /**
     * @memberOf CellSelection.prototype
     * @param {Hypergrid} grid
     * @param {Object} event - the event details
     */
    handleMouseDrag: function(grid, event) {
        if (this.dragging && grid.properties.cellSelection && !event.primitiveEvent.detail.isRightClick) {
            this.currentDrag = event.primitiveEvent.detail.mouse;
            this.lastDragCell = grid.newPoint(event.gridCell.x, event.dataCell.y);
            this.checkDragScroll(grid, this.currentDrag);
            this.handleMouseDragCellSelection(grid, this.lastDragCell, event.primitiveEvent.detail.keys);
        } else if (this.next) {
            this.next.handleMouseDrag(grid, event);
        }
    },

    /**
     * @memberOf CellSelection.prototype
     * @param {Hypergrid} grid
     * @param {Object} event - the event details
     */
    handleKeyDown: function(grid, event) {
        var detail = event.detail,
            cellEvent = grid.getGridCellFromLastSelection(true),
            navKey = cellEvent && (
                cellEvent.properties.mappedNavKey(detail.char, detail.ctrl) ||
                cellEvent.properties.navKey(detail.char, detail.ctrl)
            ),
            handler = this['handle' + navKey];


        // STEP 1: Move the selection
        if (handler) {
            handler.call(this, grid, detail);

            // STEP 2: Open the cell editor at the new position if it has `editOnNextCell` and is `editable`
            cellEvent = grid.getGridCellFromLastSelection(true); // new cell
            if (cellEvent.properties.editOnNextCell) {
                grid.editAt(cellEvent); // succeeds only if `editable`
            }

            // STEP 3: If editor not opened on new cell, take focus
            if (!grid.cellEditor) {
                grid.takeFocus();
            }
        } else if (this.next) {
            this.next.handleKeyDown(grid, event);
        }
    },

    /**
     * @memberOf CellSelection.prototype
     * @desc Handle a mousedrag selection.
     * @param {Hypergrid} grid
     * @param {Object} mouse - the event details
     * @param {Array} keys - array of the keys that are currently pressed down
     */
    handleMouseDragCellSelection: function(grid, gridCell, keys) {
        var x = Math.max(0, gridCell.x),
            y = Math.max(0, gridCell.y),
            previousDragExtent = grid.getDragExtent(),
            mouseDown = grid.getMouseDown(),
            newX = x - mouseDown.x,
            newY = y - mouseDown.y;

        if (previousDragExtent.x === newX && previousDragExtent.y === newY) {
            return;
        }

        grid.clearMostRecentSelection();

        grid.select(mouseDown.x, mouseDown.y, newX, newY);
        grid.setDragExtent(grid.newPoint(newX, newY));

        grid.repaint();
    },

    /**
     * @memberOf CellSelection.prototype
     * @desc this checks while were dragging if we go outside the visible bounds, if so, kick off the external autoscroll check function (above)
     * @param {Hypergrid} grid
     * @param {Object} mouse - the event details
     */
    checkDragScroll: function(grid, mouse) {
        if (!grid.properties.scrollingEnabled) {
            return;
        }
        var b = grid.getDataBounds();
        var inside = b.contains(mouse);
        if (inside) {
            if (grid.isScrollingNow()) {
                grid.setScrollingNow(false);
            }
        } else if (!grid.isScrollingNow()) {
            grid.setScrollingNow(true);
            this.scrollDrag(grid);
        }
    },

    /**
     * @memberOf CellSelection.prototype
     * @desc this function makes sure that while we are dragging outside of the grid visible bounds, we srcroll accordingly
     * @param {Hypergrid} grid
     */
    scrollDrag: function(grid) {
        if (!grid.isScrollingNow()) {
            return;
        }

        var dragStartedInHeaderArea = grid.isMouseDownInHeaderArea(),
            lastDragCell = this.lastDragCell,
            b = grid.getDataBounds(),

            xOffset = 0,
            yOffset = 0,

            numFixedColumns = grid.getFixedColumnCount(),
            numFixedRows = grid.getFixedRowCount(),

            dragEndInFixedAreaX = lastDragCell.x < numFixedColumns,
            dragEndInFixedAreaY = lastDragCell.y < numFixedRows;

        if (!dragStartedInHeaderArea) {
            if (this.currentDrag.x < b.origin.x) {
                xOffset = -1;
            }
            if (this.currentDrag.y < b.origin.y) {
                yOffset = -1;
            }
        }
        if (this.currentDrag.x > b.origin.x + b.extent.x) {
            xOffset = 1;
        }
        if (this.currentDrag.y > b.origin.y + b.extent.y) {
            yOffset = 1;
        }

        var dragCellOffsetX = xOffset;
        var dragCellOffsetY = yOffset;

        if (dragEndInFixedAreaX) {
            dragCellOffsetX = 0;
        }
        if (dragEndInFixedAreaY) {
            dragCellOffsetY = 0;
        }

        this.lastDragCell = lastDragCell.plusXY(dragCellOffsetX, dragCellOffsetY);
        grid.scrollBy(xOffset, yOffset);
        this.handleMouseDragCellSelection(grid, lastDragCell, []); // update the selection
        grid.repaint();
        setTimeout(this.scrollDrag.bind(this, grid), 25);
    },

    /**
     * @memberOf CellSelection.prototype
     * @desc extend a selection or create one if there isnt yet
     * @param {Hypergrid} grid
     * @param {Object} gridCell - the event details
     * @param {Array} keys - array of the keys that are currently pressed down
     */
    extendSelection: function(grid, gridCell, keys) {
        var hasCTRL = keys.indexOf('CTRL') >= 0,
            hasSHIFT = keys.indexOf('SHIFT') >= 0,
            mousePoint = grid.getMouseDown(),
            x = gridCell.x, // - numFixedColumns + scrollLeft;
            y = gridCell.y; // - numFixedRows + scrollTop;

        //were outside of the grid do nothing
        if (x < 0 || y < 0) {
            return;
        }

        //we have repeated a click in the same spot deslect the value from last time
        if (
            hasCTRL &&
            x === mousePoint.x &&
            y === mousePoint.y
        ) {
            grid.clearMostRecentSelection();
            grid.popMouseDown();
            grid.repaint();
            return;
        }

        if (!hasCTRL && !hasSHIFT) {
            grid.clearSelections();
        }

        if (hasSHIFT) {
            grid.clearMostRecentSelection();
            grid.select(mousePoint.x, mousePoint.y, x - mousePoint.x, y - mousePoint.y);
            grid.setDragExtent(grid.newPoint(x - mousePoint.x, y - mousePoint.y));
        } else {
            grid.select(x, y, 0, 0);
            grid.setMouseDown(grid.newPoint(x, y));
            grid.setDragExtent(grid.newPoint(0, 0));
        }
        grid.repaint();
    },


    /**
     * @memberOf CellSelection.prototype
     * @param {Hypergrid} grid
     */
    handleDOWNSHIFT: function(grid) {
        this.moveShiftSelect(grid, 0, 1);
    },

    /**
     * @memberOf CellSelection.prototype
     * @param {Hypergrid} grid
     * @param {Object} event - the event details
     */
    handleUPSHIFT: function(grid) {
        this.moveShiftSelect(grid, 0, -1);
    },

    /**
     * @memberOf CellSelection.prototype
     * @param {Hypergrid} grid
     * @param {Object} event - the event details
     */
    handleLEFTSHIFT: function(grid) {
        this.moveShiftSelect(grid, -1, 0);
    },

    /**
     * @memberOf CellSelection.prototype
     * @param {Hypergrid} grid
     * @param {Object} event - the event details
     */
    handleRIGHTSHIFT: function(grid) {
        this.moveShiftSelect(grid, 1, 0);
    },

    /**
     * @memberOf CellSelection.prototype
     * @param {Hypergrid} grid
     * @param {Object} event - the event details
     */
    handleDOWN: function(grid, event) {
        //keep the browser viewport from auto scrolling on key event
        event.primitiveEvent.preventDefault();

        var count = this.getAutoScrollAcceleration();
        grid.moveSingleSelect(0, count);
    },

    /**
     * @memberOf CellSelection.prototype
     * @param {Hypergrid} grid
     * @param {Object} event - the event details
     */
    handleUP: function(grid, event) {
        //keep the browser viewport from auto scrolling on key event
        event.primitiveEvent.preventDefault();

        var count = this.getAutoScrollAcceleration();
        grid.moveSingleSelect(0, -count);
    },

    /**
     * @memberOf CellSelection.prototype
     * @param {Hypergrid} grid
     * @param {Object} event - the event details
     */
    handleLEFT: function(grid) {
        grid.moveSingleSelect(-1, 0);
    },

    /**
     * @memberOf CellSelection.prototype
     * @param {Hypergrid} grid
     * @param {Object} event - the event details
     */
    handleRIGHT: function(grid) {
        grid.moveSingleSelect(1, 0);
    },

    /**
     * @memberOf CellSelection.prototype
     * @desc If we are holding down the same navigation key, accelerate the increment we scroll
     * #### returns: integer
     */
    getAutoScrollAcceleration: function() {
        var count = 1;
        var elapsed = this.getAutoScrollDuration() / 2000;
        count = Math.max(1, Math.floor(elapsed * elapsed * elapsed * elapsed));
        return count;
    },

    /**
     * @memberOf CellSelection.prototype
     * @desc set the start time to right now when we initiate an auto scroll
     */
    setAutoScrollStartTime: function() {
        this.sbAutoStart = Date.now();
    },

    /**
     * @memberOf CellSelection.prototype
     * @desc update the autoscroll start time if we haven't autoscrolled within the last 500ms otherwise update the current autoscroll time
     */
    pingAutoScroll: function() {
        var now = Date.now();
        if (now - this.sbLastAuto > 500) {
            this.setAutoScrollStartTime();
        }
        this.sbLastAuto = Date.now();
    },

    /**
     * @memberOf CellSelection.prototype
     * @desc answer how long we have been auto scrolling
     * #### returns: integer
     */
    getAutoScrollDuration: function() {
        if (Date.now() - this.sbLastAuto > 500) {
            return 0;
        }
        return Date.now() - this.sbAutoStart;
    },

    /**
     * @memberOf CellSelection.prototype
     * @desc Augment the most recent selection extent by (offsetX,offsetY) and scroll if necessary.
     * @param {Hypergrid} grid
     * @param {number} offsetX - x coordinate to start at
     * @param {number} offsetY - y coordinate to start at
     */
    moveShiftSelect: function(grid, offsetX, offsetY) {
        if (grid.extendSelect(offsetX, offsetY)) {
            this.pingAutoScroll();
        }
    }

});

module.exports = CellSelection;

},{"./Feature":70}],66:[function(require,module,exports){
/* eslint-env browser */
/* global requestAnimationFrame */

'use strict';

// This feature is responsible for column drag and drop reordering.
// This object is a mess and desperately needs a complete rewrite.....

var Feature = require('./Feature');

var canDragCursorName = '-webkit-grab',
    draggingCursorName = '-webkit-grabbing';

var columnAnimationTime = 150;
var dragger;
var draggerCTX;
var floatColumn;
var floatColumnCTX;

/**
 * @constructor
 * @extends Feature
 */
var ColumnMoving = Feature.extend('ColumnMoving', {

    /**
     * queue up the animations that need to play so they are done synchronously
     * @type {Array}
     * @memberOf CellMoving.prototype
     */
    floaterAnimationQueue: [],

    /**
     * am I currently auto scrolling right
     * @type {boolean}
     * @memberOf CellMoving.prototype
     */
    columnDragAutoScrollingRight: false,

    /**
     * am I currently auto scrolling left
     * @type {boolean}
     * @memberOf CellMoving.prototype
     */
    columnDragAutoScrollingLeft: false,

    /**
     * is the drag mechanism currently enabled ("armed")
     * @type {boolean}
     * @memberOf CellMoving.prototype
     */
    dragArmed: false,

    /**
     * am I dragging right now
     * @type {boolean}
     * @memberOf CellMoving.prototype
     */
    dragging: false,

    /**
     * the column index of the currently dragged column
     * @type {number}
     * @memberOf CellMoving.prototype
     */
    dragCol: -1,

    /**
     * an offset to position the dragged item from the cursor
     * @type {number}
     * @memberOf CellMoving.prototype
     */
    dragOffset: 0,

    /**
     * @memberOf CellMoving.prototype
     * @desc give me an opportunity to initialize stuff on the grid
     * @param {Hypergrid} grid
     */
    initializeOn: function(grid) {
        this.isFloatingNow = false;
        this.initializeAnimationSupport(grid);
        if (this.next) {
            this.next.initializeOn(grid);
        }
    },

    /**
     * @memberOf CellMoving.prototype
     * @desc initialize animation support on the grid
     * @param {Hypergrid} grid
     */
    initializeAnimationSupport: function(grid) {
        if (!dragger) {
            dragger = document.createElement('canvas');
            dragger.setAttribute('width', '0px');
            dragger.setAttribute('height', '0px');
            dragger.style.position = 'fixed';

            document.body.appendChild(dragger);
            draggerCTX = dragger.getContext('2d');
        }
        if (!floatColumn) {
            floatColumn = document.createElement('canvas');
            floatColumn.setAttribute('width', '0px');
            floatColumn.setAttribute('height', '0px');
            floatColumn.style.position = 'fixed';

            document.body.appendChild(floatColumn);
            floatColumnCTX = floatColumn.getContext('2d');
        }

    },

    /**
     * @memberOf CellMoving.prototype
     * @param {Hypergrid} grid
     * @param {Object} event - the event details
     */
    handleMouseDrag: function(grid, event) {

        var gridCell = event.gridCell;
        var x;
        //var y;

        var distance = Math.abs(event.primitiveEvent.detail.dragstart.x - event.primitiveEvent.detail.mouse.x);

        if (distance < 10 || event.isColumnFixed) {
            if (this.next) {
                this.next.handleMouseDrag(grid, event);
            }
            return;
        }

        if (event.isHeaderCell && this.dragArmed && !this.dragging) {
            this.dragging = true;
            this.dragCol = gridCell.x;
            this.dragOffset = event.mousePoint.x;
            this.detachChain();
            x = event.primitiveEvent.detail.mouse.x - this.dragOffset;
            //y = event.primitiveEvent.detail.mouse.y;
            this.createDragColumn(grid, x, this.dragCol);
        } else if (this.next) {
            this.next.handleMouseDrag(grid, event);
        }

        if (this.dragging) {
            x = event.primitiveEvent.detail.mouse.x - this.dragOffset;
            //y = event.primitiveEvent.detail.mouse.y;
            this.dragColumn(grid, x);
        }
    },

    /**
     * @memberOf CellMoving.prototype
     * @param {Hypergrid} grid
     * @param {Object} event - the event details
     */
    handleMouseDown: function(grid, event) {
        if (
            grid.behavior.isColumnReorderable() &&
            !event.isColumnFixed
        ) {
            if (event.isHeaderCell) {
                this.dragArmed = true;
                this.cursor = draggingCursorName;
                grid.clearSelections();
            }
        }
        if (this.next) {
            this.next.handleMouseDown(grid, event);
        }
    },

    /**
     * @memberOf CellMoving.prototype
     * @param {Hypergrid} grid
     * @param {Object} event - the event details
     */
    handleMouseUp: function(grid, event) {
        //var col = event.gridCell.x;
        if (this.dragging) {
            this.cursor = null;
            //delay here to give other events a chance to be dropped
            var self = this;
            this.endDragColumn(grid);
            setTimeout(function() {
                self.attachChain();
            }, 200);
        }
        this.dragCol = -1;
        this.dragging = false;
        this.dragArmed = false;
        this.cursor = null;
        grid.repaint();

        if (this.next) {
            this.next.handleMouseUp(grid, event);
        }

    },

    /**
     * @memberOf CellMoving.prototype
     * @param {Hypergrid} grid
     * @param {Object} event - the event details
     */
    handleMouseMove: function(grid, event) {
        if (
            grid.behavior.isColumnReorderable() &&
            !event.isColumnFixed &&
            !this.dragging &&
            event.isHeaderCell &&
            event.mousePoint.y < grid.properties.columnGrabMargin
        ) {
            this.cursor = canDragCursorName;
        } else {
            this.cursor = null;
        }

        if (this.next) {
            this.next.handleMouseMove(grid, event);
        }

        if (event.isHeaderCell && this.dragging) {
            this.cursor = draggingCursorName; //move';
        }
    },

    /**
     * @memberOf CellMoving.prototype
     * @desc this is the main event handler that manages the dragging of the column
     * @param {Hypergrid} grid
     * @param {boolean} draggedToTheRight - are we moving to the right
     */
    floatColumnTo: function(grid, draggedToTheRight) {
        this.floatingNow = true;

        var visibleColumns = grid.renderer.visibleColumns;
        var scrollLeft = grid.getHScrollValue();
        var floaterIndex = grid.renderOverridesCache.floater.columnIndex;
        var draggerIndex = grid.renderOverridesCache.dragger.columnIndex;
        var hdpiratio = grid.renderOverridesCache.dragger.hdpiratio;

        var draggerStartX;
        var floaterStartX;
        var fixedColumnCount = grid.getFixedColumnCount();
        var draggerWidth = grid.getColumnWidth(draggerIndex);
        var floaterWidth = grid.getColumnWidth(floaterIndex);

        var max = grid.getVisibleColumnsCount();

        var doffset = 0;
        var foffset = 0;

        if (draggerIndex >= fixedColumnCount) {
            doffset = scrollLeft;
        }
        if (floaterIndex >= fixedColumnCount) {
            foffset = scrollLeft;
        }

        if (draggedToTheRight) {
            draggerStartX = visibleColumns[Math.min(max, draggerIndex - doffset)].left;
            floaterStartX = visibleColumns[Math.min(max, floaterIndex - foffset)].left;

            grid.renderOverridesCache.dragger.startX = (draggerStartX + floaterWidth) * hdpiratio;
            grid.renderOverridesCache.floater.startX = draggerStartX * hdpiratio;

        } else {
            floaterStartX = visibleColumns[Math.min(max, floaterIndex - foffset)].left;
            draggerStartX = floaterStartX + draggerWidth;

            grid.renderOverridesCache.dragger.startX = floaterStartX * hdpiratio;
            grid.renderOverridesCache.floater.startX = draggerStartX * hdpiratio;
        }
        grid.swapColumns(draggerIndex, floaterIndex);
        grid.renderOverridesCache.dragger.columnIndex = floaterIndex;
        grid.renderOverridesCache.floater.columnIndex = draggerIndex;


        this.floaterAnimationQueue.unshift(this.doColumnMoveAnimation(grid, floaterStartX, draggerStartX));

        this.doFloaterAnimation(grid);

    },

    /**
     * @memberOf CellMoving.prototype
     * @desc manifest the column drag and drop animation
     * @param {Hypergrid} grid
     * @param {number} floaterStartX - the x start coordinate of the column underneath that floats behind the dragged column
     * @param {number} draggerStartX - the x start coordinate of the dragged column
     */
    doColumnMoveAnimation: function(grid, floaterStartX, draggerStartX) {
        var self = this;
        return function() {
            var d = floatColumn;
            d.style.display = 'inline';
            self.setCrossBrowserProperty(d, 'transform', 'translate(' + floaterStartX + 'px, ' + 0 + 'px)');

            //d.style.webkit-webkit-Transform = 'translate(' + floaterStartX + 'px, ' + 0 + 'px)';
            //d.style.webkit-webkit-Transform = 'translate(' + floaterStartX + 'px, ' + 0 + 'px)';

            requestAnimationFrame(function() {
                self.setCrossBrowserProperty(d, 'transition', (self.isWebkit ? '-webkit-' : '') + 'transform ' + columnAnimationTime + 'ms ease');
                self.setCrossBrowserProperty(d, 'transform', 'translate(' + draggerStartX + 'px, ' + -2 + 'px)');
            });
            grid.repaint();
            //need to change this to key frames

            setTimeout(function() {
                self.setCrossBrowserProperty(d, 'transition', '');
                grid.renderOverridesCache.floater = null;
                grid.repaint();
                self.doFloaterAnimation(grid);
                requestAnimationFrame(function() {
                    d.style.display = 'none';
                    self.isFloatingNow = false;
                });
            }, columnAnimationTime + 50);
        };
    },

    /**
     * @memberOf CellMoving.prototype
     * @desc manifest the floater animation
     * @param {Hypergrid} grid
     */
    doFloaterAnimation: function(grid) {
        if (this.floaterAnimationQueue.length === 0) {
            this.floatingNow = false;
            grid.repaint();
            return;
        }
        var animation = this.floaterAnimationQueue.pop();
        animation();
    },

    /**
     * @memberOf CellMoving.prototype
     * @desc create the float column at columnIndex underneath the dragged column
     * @param {Hypergrid} grid
     * @param {number} columnIndex - the index of the column that will be floating
     */
    createFloatColumn: function(grid, columnIndex) {

        var fixedColumnCount = grid.getFixedColumnCount();
        var scrollLeft = grid.getHScrollValue();

        if (columnIndex < fixedColumnCount) {
            scrollLeft = 0;
        }

        var columnWidth = grid.getColumnWidth(columnIndex);
        var colHeight = grid.div.clientHeight;
        var d = floatColumn;
        var style = d.style;
        var location = grid.div.getBoundingClientRect();

        style.top = (location.top - 2) + 'px';
        style.left = location.left + 'px';

        var hdpiRatio = grid.getHiDPI(floatColumnCTX);

        d.setAttribute('width', Math.round(columnWidth * hdpiRatio) + 'px');
        d.setAttribute('height', Math.round(colHeight * hdpiRatio) + 'px');
        style.boxShadow = '0 10px 20px rgba(0,0,0,0.19), 0 6px 6px rgba(0,0,0,0.23)';
        style.width = columnWidth + 'px'; //Math.round(columnWidth / hdpiRatio) + 'px';
        style.height = colHeight + 'px'; //Math.round(colHeight / hdpiRatio) + 'px';
        style.borderTop = '1px solid ' + grid.properties.lineColor;
        style.backgroundColor = grid.properties.backgroundColor;

        var startX = grid.renderer.visibleColumns[columnIndex - scrollLeft].left * hdpiRatio;

        floatColumnCTX.scale(hdpiRatio, hdpiRatio);

        grid.renderOverridesCache.floater = {
            columnIndex: columnIndex,
            ctx: floatColumnCTX,
            startX: startX,
            width: columnWidth,
            height: colHeight,
            hdpiratio: hdpiRatio
        };

        style.zIndex = '4';
        this.setCrossBrowserProperty(d, 'transform', 'translate(' + startX + 'px, ' + -2 + 'px)');
        style.cursor = draggingCursorName;
        grid.repaint();
    },

    /**
     * @memberOf CellMoving.prototype
     * @desc utility function for setting cross browser css properties
     * @param {HTMLElement} element - descripton
     * @param {string} property - the property
     * @param {string} value - the value to assign
     */
    setCrossBrowserProperty: function(element, property, value) {
        var uProperty = property[0].toUpperCase() + property.substr(1);
        this.setProp(element, 'webkit' + uProperty, value);
        this.setProp(element, 'Moz' + uProperty, value);
        this.setProp(element, 'ms' + uProperty, value);
        this.setProp(element, 'O' + uProperty, value);
        this.setProp(element, property, value);
    },

    /**
     * @memberOf CellMoving.prototype
     * @desc utility function for setting properties on HTMLElements
     * @param {HTMLElement} element - descripton
     * @param {string} property - the property
     * @param {string} value - the value to assign
     */
    setProp: function(element, property, value) {
        if (property in element.style) {
            element.style[property] = value;
        }
    },

    /**
     * @memberOf CellMoving.prototype
     * @desc create the dragged column at columnIndex above the floated column
     * @param {Hypergrid} grid
     * @param {number} x - the start position
     * @param {number} columnIndex - the index of the column that will be floating
     */
    createDragColumn: function(grid, x, columnIndex) {

        var fixedColumnCount = grid.getFixedColumnCount();
        var scrollLeft = grid.getHScrollValue();

        if (columnIndex < fixedColumnCount) {
            scrollLeft = 0;
        }

        var hdpiRatio = grid.getHiDPI(draggerCTX);
        var columnWidth = grid.getColumnWidth(columnIndex);
        var colHeight = grid.div.clientHeight;
        var d = dragger;
        var location = grid.div.getBoundingClientRect();
        var style = d.style;

        style.top = location.top + 'px';
        style.left = location.left + 'px';
        style.opacity = 0.85;
        style.boxShadow = '0 19px 38px rgba(0,0,0,0.30), 0 15px 12px rgba(0,0,0,0.22)';
        //style.zIndex = 100;
        style.borderTop = '1px solid ' + grid.properties.lineColor;
        style.backgroundColor = grid.properties.backgroundColor;

        d.setAttribute('width', Math.round(columnWidth * hdpiRatio) + 'px');
        d.setAttribute('height', Math.round(colHeight * hdpiRatio) + 'px');

        style.width = columnWidth + 'px'; //Math.round(columnWidth / hdpiRatio) + 'px';
        style.height = colHeight + 'px'; //Math.round(colHeight / hdpiRatio) + 'px';

        var startX = grid.renderer.visibleColumns[columnIndex - scrollLeft].left * hdpiRatio;

        draggerCTX.scale(hdpiRatio, hdpiRatio);

        grid.renderOverridesCache.dragger = {
            columnIndex: columnIndex,
            startIndex: columnIndex,
            ctx: draggerCTX,
            startX: startX,
            width: columnWidth,
            height: colHeight,
            hdpiratio: hdpiRatio
        };

        this.setCrossBrowserProperty(d, 'transform', 'translate(' + x + 'px, -5px)');
        style.zIndex = '5';
        style.cursor = draggingCursorName;
        grid.repaint();
    },

    /**
     * @memberOf CellMoving.prototype
     * @desc this function is the main dragging logic
     * @param {Hypergrid} grid
     * @param {number} x - the start position
     */
    dragColumn: function(grid, x) {

        //TODO: this function is overly complex, refactor this in to something more reasonable
        var self = this;

        var autoScrollingNow = this.columnDragAutoScrollingRight || this.columnDragAutoScrollingLeft;

        var hdpiRatio = grid.getHiDPI(draggerCTX);

        var dragColumnIndex = grid.renderOverridesCache.dragger.columnIndex;

        var minX = 0;
        var maxX = grid.renderer.getFinalVisibleColumnBoundary();
        x = Math.min(x, maxX + 15);
        x = Math.max(minX - 15, x);

        //am I at my lower bound
        var atMin = x < minX && dragColumnIndex !== 0;

        //am I at my upper bound
        var atMax = x > maxX;

        var d = dragger;

        this.setCrossBrowserProperty(d, 'transition', (self.isWebkit ? '-webkit-' : '') + 'transform ' + 0 + 'ms ease, box-shadow ' + columnAnimationTime + 'ms ease');

        this.setCrossBrowserProperty(d, 'transform', 'translate(' + x + 'px, ' + -10 + 'px)');
        requestAnimationFrame(function() {
            d.style.display = 'inline';
        });

        var overCol = grid.renderer.getColumnFromPixelX(x + (d.width / 2 / hdpiRatio));

        if (atMin) {
            overCol = 0;
        }

        if (atMax) {
            overCol = grid.getColumnCount() - 1;
        }

        var doAFloat = dragColumnIndex > overCol;
        doAFloat = doAFloat || (overCol - dragColumnIndex >= 1);

        if (doAFloat && !autoScrollingNow) {
            var draggedToTheRight = dragColumnIndex < overCol;
            // if (draggedToTheRight) {
            //     overCol -= 1;
            // }
            if (this.isFloatingNow) {
                return;
            }

            this.isFloatingNow = true;
            this.createFloatColumn(grid, overCol);
            this.floatColumnTo(grid, draggedToTheRight);
        } else {

            if (x < minX - 10) {
                this.checkAutoScrollToLeft(grid, x);
            }
            if (x > minX - 10) {
                this.columnDragAutoScrollingLeft = false;
            }
            //lets check for autoscroll to right if were up against it
            if (atMax || x > maxX + 10) {
                this.checkAutoScrollToRight(grid, x);
                return;
            }
            if (x < maxX + 10) {
                this.columnDragAutoScrollingRight = false;
            }
        }
    },

    /**
     * @memberOf CellMoving.prototype
     * @desc autoscroll to the right if necessary
     * @param {Hypergrid} grid
     * @param {number} x - the start position
     */
    checkAutoScrollToRight: function(grid, x) {
        if (this.columnDragAutoScrollingRight) {
            return;
        }
        this.columnDragAutoScrollingRight = true;
        this._checkAutoScrollToRight(grid, x);
    },

    _checkAutoScrollToRight: function(grid, x) {
        if (!this.columnDragAutoScrollingRight) {
            return;
        }
        var scrollLeft = grid.getHScrollValue();
        if (!grid.dragging || scrollLeft > (grid.sbHScroller.range.max - 2)) {
            return;
        }
        var draggedIndex = grid.renderOverridesCache.dragger.columnIndex;
        grid.scrollBy(1, 0);
        var newIndex = draggedIndex + 1;

        grid.swapColumns(newIndex, draggedIndex);
        grid.renderOverridesCache.dragger.columnIndex = newIndex;

        setTimeout(this._checkAutoScrollToRight.bind(this, grid, x), 250);
    },

    /**
     * @memberOf CellMoving.prototype
     * @desc autoscroll to the left if necessary
     * @param {Hypergrid} grid
     * @param {number} x - the start position
     */
    checkAutoScrollToLeft: function(grid, x) {
        if (this.columnDragAutoScrollingLeft) {
            return;
        }
        this.columnDragAutoScrollingLeft = true;
        this._checkAutoScrollToLeft(grid, x);
    },

    _checkAutoScrollToLeft: function(grid, x) {
        if (!this.columnDragAutoScrollingLeft) {
            return;
        }

        var scrollLeft = grid.getHScrollValue();
        if (!grid.dragging || scrollLeft < 1) {
            return;
        }
        var draggedIndex = grid.renderOverridesCache.dragger.columnIndex;
        grid.swapColumns(draggedIndex + scrollLeft, draggedIndex + scrollLeft - 1);
        grid.scrollBy(-1, 0);
        setTimeout(this._checkAutoScrollToLeft.bind(this, grid, x), 250);
    },

    /**
     * @memberOf CellMoving.prototype
     * @desc a column drag has completed, update data and cleanup
     * @param {Hypergrid} grid
     */
    endDragColumn: function(grid) {

        var fixedColumnCount = grid.getFixedColumnCount();
        var scrollLeft = grid.getHScrollValue();

        var columnIndex = grid.renderOverridesCache.dragger.columnIndex;

        if (columnIndex < fixedColumnCount) {
            scrollLeft = 0;
        }

        var self = this;
        var startX = grid.renderer.visibleColumns[columnIndex - scrollLeft].left;
        var d = dragger;
        var changed = grid.renderOverridesCache.dragger.startIndex !== grid.renderOverridesCache.dragger.columnIndex;
        self.setCrossBrowserProperty(d, 'transition', (self.isWebkit ? '-webkit-' : '') + 'transform ' + columnAnimationTime + 'ms ease, box-shadow ' + columnAnimationTime + 'ms ease');
        self.setCrossBrowserProperty(d, 'transform', 'translate(' + startX + 'px, ' + -1 + 'px)');
        d.style.boxShadow = '0px 0px 0px #888888';

        setTimeout(function() {
            grid.renderOverridesCache.dragger = null;
            grid.repaint();
            requestAnimationFrame(function() {
                d.style.display = 'none';
                grid.endDragColumnNotification(); //internal notification
                if (changed){
                    grid.fireSyntheticOnColumnsChangedEvent(); //public notification
                }
            });
        }, columnAnimationTime + 50);

    }

});

module.exports = ColumnMoving;

},{"./Feature":70}],67:[function(require,module,exports){
'use strict';

var Feature = require('./Feature');

/**
 * @constructor
 * @extends Feature
 */
var ColumnResizing = Feature.extend('ColumnResizing', {

    /**
     * the pixel location of the where the drag was initiated
     * @type {number}
     * @default
     * @memberOf ColumnResizing.prototype
     */
    dragStart: -1,

    /**
     * the starting width/height of the row/column we are dragging
     * @type {number}
     * @default -1
     * @memberOf ColumnResizing.prototype
     */
    dragStartWidth: -1,

    /**
     * @memberOf ColumnResizing.prototype
     * @desc get the mouse x,y coordinate
     * @returns {number}
     * @param {MouseEvent} event - the mouse event to query
     */
    getMouseValue: function(event) {
        return event.primitiveEvent.detail.mouse.x;
    },

    /**
     * @memberOf ColumnResizing.prototype
     * @desc returns the index of which divider I'm over
     * @returns {number}
     * @param {Hypergrid} grid
     * @param {Object} event - the event details
     */
    overAreaDivider: function(grid, event) {
        var leftMostColumnIndex = grid.behavior.leftMostColIndex;
        return event.gridCell.x !== leftMostColumnIndex && event.mousePoint.x <= 3 ||
            event.mousePoint.x >= event.bounds.width - 3;
    },

    /**
     * @memberOf ColumnResizing.prototype
     * @desc return the cursor name
     * @returns {string}
     */
    getCursorName: function() {
        return 'col-resize';
    },

    /**
     * @memberOf ColumnResizing.prototype
     * @param {Hypergrid} grid
     * @param {Object} event - the event details
     */
    handleMouseDrag: function(grid, event) {
        if (this.dragColumn) {
            var delta = this.getMouseValue(event) - this.dragStart;
            grid.behavior.setColumnWidth(this.dragColumn, this.dragStartWidth + delta);
        } else if (this.next) {
            this.next.handleMouseDrag(grid, event);
        }
    },

    /**
     * @memberOf ColumnResizing.prototype
     * @param {Hypergrid} grid
     * @param {Object} event - the event details
     */
    handleMouseDown: function(grid, event) {
        if (event.isHeaderRow && this.overAreaDivider(grid, event)) {
            if (event.mousePoint.x <= 3) {
                var columnIndex = event.gridCell.x - 1;
                this.dragColumn = grid.behavior.getActiveColumn(columnIndex);
                //this.dragStartWidth = grid.renderer.visibleColumns[columnIndex].width;
                var visibleColIndex = grid.behavior.rowColumnIndex;
                var dragColumn = this.dragColumn;
                grid.renderer.visibleColumns.forEachWithNeg(function(vCol, vIndex){
                    var col = vCol.column;
                    if (col.index === dragColumn.index){
                        visibleColIndex = vIndex;
                    }
                });
                this.dragStartWidth = grid.renderer.visibleColumns[visibleColIndex].width;
            } else {
                this.dragColumn = event.column;
                this.dragStartWidth = event.bounds.width;
            }

            this.dragStart = this.getMouseValue(event);
            //this.detachChain();
        } else if (this.next) {
            this.next.handleMouseDown(grid, event);
        }
    },

    /**
     * @memberOf ColumnResizing.prototype
     * @param {Hypergrid} grid
     * @param {Object} event - the event details
     */
    handleMouseUp: function(grid, event) {
        if (this.dragColumn) {
            this.cursor = null;
            this.dragColumn = false;

            event.primitiveEvent.stopPropagation();
            //delay here to give other events a chance to be dropped
            grid.behaviorShapeChanged();
        } else if (this.next) {
            this.next.handleMouseUp(grid, event);
        }
    },

    /**
     * @memberOf ColumnResizing.prototype
     * @param {Hypergrid} grid
     * @param {Object} event - the event details
     */
    handleMouseMove: function(grid, event) {
        if (!this.dragColumn) {
            this.cursor = null;

            if (this.next) {
                this.next.handleMouseMove(grid, event);
            }

            this.cursor = event.isHeaderRow && this.overAreaDivider(grid, event) ? this.getCursorName() : null;
        }
    },

    /**
     * @param {Hypergrid} grid
     * @param {CellEvent} cellEvent
     * @memberOf ColumnResizing.prototype
     */
    handleDoubleClick: function(grid, event) {
        if (event.isHeaderRow && this.overAreaDivider(grid, event)) {
            var column = event.mousePoint.x <= 3
                ? grid.behavior.getActiveColumn(event.gridCell.x - 1)
                : event.column;
            column.addProperties({
                columnAutosizing: true,
                columnAutosized: false // todo: columnAutosizing should be a setter that automatically resets columnAutosized on state change to true
            });
            setTimeout(function() { // do after next render, which measures text now that auto-sizing is on
                grid.autosizeColumn(column);
            });
        } else if (this.next) {
            this.next.handleDoubleClick(grid, event);
        }
    }

});

module.exports = ColumnResizing;

},{"./Feature":70}],68:[function(require,module,exports){
'use strict';

var Feature = require('./Feature');

/**
 * @constructor
 * @extends Feature
 */
var ColumnSelection = Feature.extend('ColumnSelection', {

    /**
     * The pixel location of the mouse pointer during a drag operation.
     * @type {Point}
     * @default null
     * @memberOf ColumnSelection.prototype
     */
    currentDrag: null,

    /**
     * The horizontal cell coordinate of the where the mouse pointer is during a drag operation.
     * @type {Object}
     * @default null
     * @memberOf ColumnSelection.prototype
     */
    lastDragColumn: null,

    /**
     * a millisecond value representing the previous time an autoscroll started
     * @type {number}
     * @default 0
     * @memberOf ColumnSelection.prototype
     */
    sbLastAuto: 0,

    /**
     * a millisecond value representing the time the current autoscroll started
     * @type {number}
     * @default 0
     * @memberOf ColumnSelection.prototype
     */
    sbAutoStart: 0,


    /**
     * @memberOf ColumnSelection.prototype
     * @param {Hypergrid} grid
     * @param {Object} event - the event details
     */
    handleMouseUp: function(grid, event) {
        if (this.dragging) {
            this.dragging = false;
        }
        if (this.next) {
            this.next.handleMouseUp(grid, event);
        }
    },

    handleDoubleClick: function(grid, event) {
        if (this.doubleClickTimer) {
            clearTimeout(this.doubleClickTimer); // prevent mouseDown from continuing
            this.doubleClickTimer = undefined;
        }
        if (this.next) {
            this.next.handleDoubleClick(grid, event);
        }
    },

    /**
     * @memberOf ColumnSelection.prototype
     * @param {Hypergrid} grid
     * @param {Object} event - the event details
     */
    handleMouseDown: function(grid, event) {
        if (this.doubleClickTimer) {
            return;
        }

        // todo: >= 5 depends on header being top-most row which is currently always true but we may allow header "section" to be arbitrary position within quadrant (see also handleMouseDown in ColumnMoving.js)
        if (
            grid.properties.columnSelection &&
            event.mousePoint.y >= 5 &&
            !event.primitiveEvent.detail.isRightClick &&
            event.isHeaderCell
        ) {
            // HOLD OFF WHILE WAITING FOR DOUBLE-CLICK
            this.doubleClickTimer = setTimeout(
                doubleClickTimerCallback.bind(this, grid, event),
                doubleClickDelay.call(this, grid, event)
            );
        } else if (this.next) {
            this.next.handleMouseDown(grid, event);
        }
    },

    /**
     * @memberOf ColumnSelection.prototype
     * @param {Hypergrid} grid
     * @param {Object} event - the event details
     */
    handleMouseDrag: function(grid, event) {
        if (
            grid.properties.columnSelection &&
            !this.isColumnDragging(grid) &&
            !event.primitiveEvent.detail.isRightClick &&
            this.dragging
        ) {
            //if we are in the fixed area do not apply the scroll values
            this.lastDragColumn = event.gridCell.x;
            this.currentDrag = event.primitiveEvent.detail.mouse;
            this.checkDragScroll(grid, this.currentDrag);
            this.handleMouseDragCellSelection(grid, this.lastDragColumn, event.primitiveEvent.detail.keys);
        } else if (this.next) {
            this.next.handleMouseDrag(grid, event);
        }
    },

    /**
     * @memberOf ColumnSelection.prototype
     * @param {Hypergrid} grid
     * @param {Object} event - the event details
     */
    handleKeyDown: function(grid, event) {
        var detail = event.detail,
            handler = grid.getLastSelectionType() === 'column' &&
                this['handle' + detail.char];

        if (handler) {
            handler.call(this, grid, detail);
        } else if (this.next) {
            this.next.handleKeyDown(grid, event);
        }
    },

    /**
     * @memberOf ColumnSelection.prototype
     * @desc Handle a mousedrag selection
     * @param {Hypergrid} grid
     * @param {Object} mouse - the event details
     * @param {Array} keys - array of the keys that are currently pressed down
     */
    handleMouseDragCellSelection: function(grid, x, keys) {
        var mouseX = grid.getMouseDown().x;

        grid.clearMostRecentColumnSelection();

        grid.selectColumn(mouseX, x);
        grid.setDragExtent(grid.newPoint(x - mouseX, 0));

        grid.repaint();
    },

    /**
     * @memberOf ColumnSelection.prototype
     * @desc this checks while were dragging if we go outside the visible bounds, if so, kick off the external autoscroll check function (above)
     * @param {Hypergrid} grid
     * @param {Object} mouse - the event details
     */
    checkDragScroll: function(grid, mouse) {
        if (
            grid.properties.scrollingEnabled &&
            grid.getDataBounds().contains(mouse)
        ) {
            if (grid.isScrollingNow()) {
                grid.setScrollingNow(false);
            }
        } else {
            if (!grid.isScrollingNow()) {
                grid.setScrollingNow(true);
                this.scrollDrag(grid);
            }
        }
    },

    /**
     * @memberOf ColumnSelection.prototype
     * @desc this function makes sure that while we are dragging outside of the grid visible bounds, we srcroll accordingly
     * @param {Hypergrid} grid
     */
    scrollDrag: function(grid) {
        if (!grid.isScrollingNow()) {
            return;
        }

        var b = grid.getDataBounds(),
            xOffset;

        if (this.currentDrag.x < b.origin.x) {
            xOffset = -1;
        } else if (this.currentDrag.x > b.origin.x + b.extent.x) {
            xOffset = 1;
        }

        if (xOffset) {
            if (this.lastDragColumn >= grid.getFixedColumnCount()) {
                this.lastDragColumn += xOffset;
            }
            grid.scrollBy(xOffset, 0);
        }

        this.handleMouseDragCellSelection(grid, this.lastDragColumn, []); // update the selection
        grid.repaint();
        setTimeout(this.scrollDrag.bind(this, grid), 25);
    },

    /**
     * @memberOf ColumnSelection.prototype
     * @desc extend a selection or create one if there isnt yet
     * @param {Hypergrid} grid
     * @param {Object} gridCell - the event details
     * @param {Array} keys - array of the keys that are currently pressed down
     */
    extendSelection: function(grid, x, keys) {
        if (!grid.abortEditing()) { return; }

        var mouseX = grid.getMouseDown().x,
            hasSHIFT = keys.indexOf('SHIFT') > 0;

        if (x < 0) { // outside of the grid?
            return; // do nothing
        }

        if (hasSHIFT) {
            grid.clearMostRecentColumnSelection();
            grid.selectColumn(x, mouseX);
            grid.setDragExtent(grid.newPoint(x - mouseX, 0));
        } else {
            grid.toggleSelectColumn(x, keys);
            grid.setMouseDown(grid.newPoint(x, 0));
            grid.setDragExtent(grid.newPoint(0, 0));
        }

        grid.repaint();
    },


    /**
     * @memberOf ColumnSelection.prototype
     * @param {Hypergrid} grid
     */
    handleDOWNSHIFT: function(grid) {},

    /**
     * @memberOf ColumnSelection.prototype
     * @param {Hypergrid} grid
     * @param {Object} event - the event details
     */
    handleUPSHIFT: function(grid) {},

    /**
     * @memberOf ColumnSelection.prototype
     * @param {Hypergrid} grid
     * @param {Object} event - the event details
     */
    handleLEFTSHIFT: function(grid) {
        this.moveShiftSelect(grid, -1);
    },

    /**
     * @memberOf ColumnSelection.prototype
     * @param {Hypergrid} grid
     * @param {Object} event - the event details
     */
    handleRIGHTSHIFT: function(grid) {
        this.moveShiftSelect(grid, 1);
    },

    /**
     * @memberOf ColumnSelection.prototype
     * @param {Hypergrid} grid
     * @param {Object} event - the event details
     */
    handleDOWN: function(grid) {

        // var mouseCorner = grid.getMouseDown().plus(grid.getDragExtent());
        // var maxRows = grid.getRowCount() - 1;

        // var newX = mouseCorner.x;
        // var newY = grid.getHeaderRowCount() + grid.getVScrollValue();

        // newY = Math.min(maxRows, newY);

        // grid.clearSelections();
        // grid.select(newX, newY, 0, 0);
        // grid.setMouseDown(new grid.rectangular.Point(newX, newY));
        // grid.setDragExtent(new grid.rectangular.Point(0, 0));

        // grid.repaint();
    },

    /**
     * @memberOf ColumnSelection.prototype
     * @param {Hypergrid} grid
     * @param {Object} event - the event details
     */
    handleUP: function(grid) {},

    /**
     * @memberOf ColumnSelection.prototype
     * @param {Hypergrid} grid
     * @param {Object} event - the event details
     */
    handleLEFT: function(grid) {
        this.moveSingleSelect(grid, -1);
    },

    /**
     * @memberOf ColumnSelection.prototype
     * @param {Hypergrid} grid
     * @param {Object} event - the event details
     */
    handleRIGHT: function(grid) {
        this.moveSingleSelect(grid, 1);
    },

    /**
     * @memberOf ColumnSelection.prototype
     * @desc If we are holding down the same navigation key, accelerate the increment we scroll
     * #### returns: integer
     */
    getAutoScrollAcceleration: function() {
        var elapsed = this.getAutoScrollDuration() / 2000;
        return Math.max(1, Math.floor(elapsed * elapsed * elapsed * elapsed));
    },

    /**
     * @memberOf ColumnSelection.prototype
     * @desc set the start time to right now when we initiate an auto scroll
     */
    setAutoScrollStartTime: function() {
        this.sbAutoStart = Date.now();
    },

    /**
     * @memberOf ColumnSelection.prototype
     * @desc update the autoscroll start time if we haven't autoscrolled within the last 500ms otherwise update the current autoscroll time
     */
    pingAutoScroll: function() {
        var now = Date.now();
        if (now - this.sbLastAuto > 500) {
            this.setAutoScrollStartTime();
        }
        this.sbLastAuto = Date.now();
    },

    /**
     * @memberOf ColumnSelection.prototype
     * @desc answer how long we have been auto scrolling
     * #### returns: integer
     */
    getAutoScrollDuration: function() {
        if (Date.now() - this.sbLastAuto > 500) {
            return 0;
        }
        return Date.now() - this.sbAutoStart;
    },

    /**
     * @memberOf ColumnSelection.prototype
     * @desc Augment the most recent selection extent by (offsetX,offsetY) and scroll if necessary.
     * @param {Hypergrid} grid
     * @param {number} offsetX - x coordinate to start at
     * @param {number} offsetY - y coordinate to start at
     */
    moveShiftSelect: function(grid, offsetX) {
        var origin = grid.getMouseDown(),
            extent = grid.getDragExtent(),
            newX = extent.x + offsetX,
            maxViewableColumns = grid.renderer.visibleColumns.length - 1,
            maxColumns = grid.getColumnCount() - 1;

        if (!grid.properties.scrollingEnabled) {
            maxColumns = Math.min(maxColumns, maxViewableColumns);
        }

        newX = Math.min(maxColumns - origin.x, Math.max(-origin.x, newX));

        grid.clearMostRecentColumnSelection();
        grid.selectColumn(origin.x, origin.x + newX);
        grid.setDragExtent(grid.newPoint(newX, 0));

        if (grid.insureModelColIsVisible(newX + origin.x, offsetX)) {
            this.pingAutoScroll();
        }

        grid.repaint();
    },

    /**
     * @memberOf ColumnSelection.prototype
     * @desc Replace the most recent selection with a single cell selection that is moved (offsetX,offsetY) from the previous selection extent.
     * @param {Hypergrid} grid
     * @param {number} offsetX - x coordinate to start at
     * @param {number} offsetY - y coordinate to start at
     */
    moveSingleSelect: function(grid, offsetX) {
        var extent = grid.getDragExtent(),
            mouseCorner = grid.getMouseDown().plus(extent),
            newX = mouseCorner.x + offsetX,
            maxColumns = grid.getColumnCount() - 1,
            maxViewableColumns = grid.getVisibleColumnsCount() - 1;

        if (!grid.properties.scrollingEnabled) {
            maxColumns = Math.min(maxColumns, maxViewableColumns);
        }

        newX = Math.min(maxColumns, Math.max(0, newX));

        grid.clearSelections();
        grid.selectColumn(newX);
        grid.setMouseDown(grid.newPoint(newX, 0));
        grid.setDragExtent(grid.newPoint(0, 0));

        if (grid.insureModelColIsVisible(newX, offsetX)) {
            this.pingAutoScroll();
        }

        grid.repaint();
    },

    isColumnDragging: function(grid) {
        var dragger = grid.lookupFeature('ColumnMoving');
        return dragger && dragger.dragging && !this.dragging;
    }

});

function doubleClickDelay(grid, event) {
    var columnProperties;

    return (
        event.isHeaderCell &&
        !(columnProperties = event.columnProperties).unsortable &&
        columnProperties.sortOnDoubleClick &&
        300
    );
}

function doubleClickTimerCallback(grid, event) {
    this.doubleClickTimer = undefined;
    this.dragging = true;
    this.extendSelection(grid, event.gridCell.x, event.primitiveEvent.detail.keys);
}

module.exports = ColumnSelection;

},{"./Feature":70}],69:[function(require,module,exports){
'use strict';

var Feature = require('./Feature');

/**
 * @constructor
 * @extends Feature
 */
var ColumnSorting = Feature.extend('ColumnSorting', {

    /**
     * @memberOf ColumnSorting.prototype
     * @param {Hypergrid} grid
     * @param {Object} event - the event details
     */
    handleClick: function(grid, event) {
        sort.call(this, grid, event);
    },

    /**
     * @memberOf ColumnSorting.prototype
     * @param {Hypergrid} grid
     * @param {Object} event - the event details
     */
    handleDoubleClick: function(grid, event) {
        sort.call(this, grid, event, true);
    },

    /**
     * @memberOf ColumnSorting.prototype
     * @param {Hypergrid} grid
     * @param {Object} event - the event details
     */
    handleMouseMove: function(grid, event) {
        var columnProperties;
        if (
            event.isRowFixed &&
            event.isHeaderCell &&
            (columnProperties = grid.behavior.getColumnProperties(event.gridCell.x)) &&
            !columnProperties.unsortable
        ) {
            this.cursor = 'pointer';
        } else {
            this.cursor = null;
        }
        if (this.next) {
            this.next.handleMouseMove(grid, event);
        }
    }

});

// Note: Keep ! in place to convert both sides to bool for
// accurate equality test because either could be undefined.
function sort(grid, event, onDoubleClick) {
    var columnProperties;
    if (
        event.isHeaderCell &&
        !(columnProperties = event.columnProperties).unsortable &&
        !columnProperties.sortOnDoubleClick === !onDoubleClick // caution see note
    ) {
        grid.fireSyntheticColumnSortEvent(event.gridCell.x, event.primitiveEvent.detail.keys);
    }

    if (this.next) {
        this.next[onDoubleClick ? 'handleDoubleClick' : 'handleClick'](grid, event);
    }
}

module.exports = ColumnSorting;

},{"./Feature":70}],70:[function(require,module,exports){
'use strict';

var Base = require('../Base');

/**
 * Instances of features are connected to one another to make a chain of responsibility for handling all the input to the hypergrid.
 * @constructor
 */
var Feature = Base.extend('Feature', {

    /**
     * the next feature to be given a chance to handle incoming events
     * @type {Feature}
     * @default null
     * @memberOf Feature.prototype
     */
    next: null,

    /**
     * a temporary holding field for my next feature when I'm in a disconnected state
     * @type {Feature}
     * @default null
     * @memberOf Feature.prototype
     */
    detached: null,

    /**
     * the cursor I want to be displayed
     * @type {string}
     * @default null
     * @memberOf Feature.prototype
     */
    cursor: null,

    /**
     * the cell location where the cursor is currently
     * @type {Point}
     * @default null
     * @memberOf Feature.prototype
     */
    currentHoverCell: null,

    /**
     * @memberOf Feature.prototype
     * @desc set my next field, or if it's populated delegate to the feature in my next field
     * @param {Feature} nextFeature - this is how we build the chain of responsibility
     * @private Not really private but was cluttering up all the feature doc pages.
     */
    setNext: function(nextFeature) {
        if (this.next) {
            this.next.setNext(nextFeature);
        } else {
            this.next = nextFeature;
            this.detached = nextFeature;
        }
    },

    /**
     * @memberOf Feature.prototype
     * @desc disconnect my child
     */
    detachChain: function() {
        this.next = null;
    },

    /**
     * @memberOf Feature.prototype
     * @desc reattach my child from the detached reference
     */
    attachChain: function() {
        this.next = this.detached;
    },

    /**
     * @memberOf Feature.prototype
     * @desc handle mouse move down the feature chain of responsibility
     * @param {Hypergrid} grid
     * @param {Object} event - the event details
     * @private Not really private but was cluttering up all the feature doc pages.
     */
    handleMouseMove: function(grid, event) {
        if (this.next) {
            this.next.handleMouseMove(grid, event);
        }
    },

    /**
     * @memberOf Feature.prototype
     * @param {Hypergrid} grid
     * @param {Object} event - the event details
     * @private Not really private but was cluttering up all the feature doc pages.
     */
    handleMouseExit: function(grid, event) {
        if (this.next) {
            this.next.handleMouseExit(grid, event);
        }
    },

    /**
     * @memberOf Feature.prototype
     * @param {Hypergrid} grid
     * @param {Object} event - the event details
     * @private Not really private but was cluttering up all the feature doc pages.
     */
    handleMouseEnter: function(grid, event) {
        if (this.next) {
            this.next.handleMouseEnter(grid, event);
        }
    },

    /**
     * @memberOf Feature.prototype
     * @param {Hypergrid} grid
     * @param {Object} event - the event details
     * @private Not really private but was cluttering up all the feature doc pages.
     */
    handleMouseDown: function(grid, event) {
        if (this.next) {
            this.next.handleMouseDown(grid, event);
        }
    },

    /**
     * @memberOf Feature.prototype
     * @param {Hypergrid} grid
     * @param {Object} event - the event details
     * @private Not really private but was cluttering up all the feature doc pages.
     */
    handleMouseUp: function(grid, event) {
        if (this.next) {
            this.next.handleMouseUp(grid, event);
        }
    },

    /**
     * @memberOf Feature.prototype
     * @param {Hypergrid} grid
     * @param {Object} event - the event details
     * @private Not really private but was cluttering up all the feature doc pages.
     */
    handleKeyDown: function(grid, event) {
        if (this.next) {
            this.next.handleKeyDown(grid, event);
        } else {
            return true;
        }
    },

    /**
     * @memberOf Feature.prototype
     * @param {Hypergrid} grid
     * @param {Object} event - the event details
     * @private Not really private but was cluttering up all the feature doc pages.
     */
    handleKeyUp: function(grid, event) {
        if (this.next) {
            this.next.handleKeyUp(grid, event);
        }
    },

    /**
     * @memberOf Feature.prototype
     * @param {Hypergrid} grid
     * @param {Object} event - the event details
     * @private Not really private but was cluttering up all the feature doc pages.
     */
    handleWheelMoved: function(grid, event) {
        if (this.next) {
            this.next.handleWheelMoved(grid, event);
        }
    },

    /**
     * @memberOf Feature.prototype
     * @param {Hypergrid} grid
     * @param {Object} event - the event details
     * @private Not really private but was cluttering up all the feature doc pages.
     */
    handleDoubleClick: function(grid, event) {
        if (this.next) {
            this.next.handleDoubleClick(grid, event);
        }
    },

    /**
     * @memberOf Feature.prototype
     * @param {Hypergrid} grid
     * @param {Object} event - the event details
     * @private Not really private but was cluttering up all the feature doc pages.
     */
    handleClick: function(grid, event) {
        if (this.next) {
            this.next.handleClick(grid, event);
        }
    },

    /**
     * @memberOf Feature.prototype
     * @param {Hypergrid} grid
     * @param {Object} event - the event details
     * @private Not really private but was cluttering up all the feature doc pages.
     */
    handleMouseDrag: function(grid, event) {
        if (this.next) {
            this.next.handleMouseDrag(grid, event);
        }
    },

    /**
     * @memberOf Feature.prototype
     * @param {Hypergrid} grid
     * @param {Object} event - the event details
     * @private Not really private but was cluttering up all the feature doc pages.
     */
    handleContextMenu: function(grid, event) {
        if (this.next) {
            this.next.handleContextMenu(grid, event);
        }
    },

    /**
     * @memberOf Feature.prototype
     * @desc toggle the column picker
     * @private Not really private but was cluttering up all the feature doc pages.
     */
    moveSingleSelect: function(grid, x, y) {
        if (this.next) {
            this.next.moveSingleSelect(grid, x, y);
        }
    },

    /**
     * @memberOf Feature.prototype
     * @param {Hypergrid} grid
     * @param {Object} event - the event details
     */
    isFirstFixedRow: function(grid, event) {
        return event.gridCell.y < 1;
    },

    /**
     * @memberOf Feature.prototype
     * @param {Hypergrid} grid
     * @param {Object} event - the event details
     */
    isFirstFixedColumn: function(grid, event) {
        return event.gridCell.x === 0;
    },

    /**
     * @memberOf Feature.prototype
     * @param {Hypergrid} grid
     * @param {Object} event - the event details
     * @private Not really private but was cluttering up all the feature doc pages.
     */
    setCursor: function(grid) {
        if (this.next) {
            this.next.setCursor(grid);
        }
        if (this.cursor) {
            grid.beCursor(this.cursor);
        }
    },

    /**
     * @memberOf Feature.prototype
     * @param {Hypergrid} grid
     * @param {Object} event - the event details
     * @private Not really private but was cluttering up all the feature doc pages.
     */
    initializeOn: function(grid) {
        if (this.next) {
            this.next.initializeOn(grid);
        }
    }

});


Feature.abstract = true; // don't instantiate directly


module.exports = Feature;

},{"../Base":25}],71:[function(require,module,exports){
'use strict';

var Feature = require('./Feature');

/**
 * @constructor
 */
var Filters = Feature.extend('Filters', {

    /**
     * Navigate away from the filter cell when:
     * 1. Coming from a cell editor (`event.detail.editor` defined).
     * 2. The cell editor was for a filter cell.
     * 3. The key (`event.detail.char) maps (through {@link module:defaults.navKeyMap|navKeyMap}) to one of:
     *    * `'UP'` or `'DOWN'` - Selects first visible data cell under filter cell.
     *    * `'LEFT'` - Opens filter cell editor in previous filterable column; if nonesuch, selects first visible data cell under filter cell.
     *    * `'RIGHT'` - Opens filter cell editor in next filterable column; if nonesuch, selects first visible data cell under filter cell.
     */
    handleKeyDown: function(grid, event) {
        var cellEvent, mappedNavKey, handler,
            detail = event.detail;

        if (detail.editor) {
            cellEvent = detail.editor.event;
            if (cellEvent.isFilterCell) {
                mappedNavKey = cellEvent.properties.mappedNavKey(detail.char);
                handler = this['handle' + mappedNavKey];
            }
        }

        if (handler) {
            handler.call(this, grid, detail);
        } else if (this.next) {
            this.next.handleKeyDown(grid, event);
        }
    },

    handleLEFT: function(grid, detail) { moveLaterally(grid, detail, -1); },
    handleRIGHT: function(grid, detail) { moveLaterally(grid, detail, +1); },
    handleUP: moveDown,
    handleDOWN: moveDown,

    handleDoubleClick: function(grid, event) {
        if (event.isFilterCell) {
            grid.onEditorActivate(event);
        } else if (this.next) {
            this.next.handleDoubleClick(grid, event);
        }
    },

    handleClick: function(grid, event) {
        if (event.isFilterCell) {
            grid.onEditorActivate(event);
        } else if (this.next) {
            this.next.handleClick(grid, event);
        }
    }

});

function moveLaterally(grid, detail, deltaX) {
    var cellEvent = detail.editor.event,
        gridX = cellEvent.visibleColumn.index,
        gridY = cellEvent.visibleRow.index,
        originX = gridX,
        C = grid.renderer.visibleColumns.length;

    cellEvent = new grid.behavior.CellEvent; // redefine so we don't reset the original below

    while (
        (gridX = (gridX + deltaX + C) % C) !== originX &&
        cellEvent.resetGridXY(gridX, gridY)
    ) {
        if (cellEvent.properties.filterable) {
            // Select previous or next filterable column's filter cell
            grid.editAt(cellEvent);
            return;
        }
    }

    moveDown(grid, cellEvent);
}

function moveDown(grid, detail) {
    var cellEvent = detail.editor.event,
        gridX = cellEvent.visibleColumn.index;

    // Select first visible grid cell of this column
    grid.selectViewportCell(gridX, 0);
    grid.takeFocus();
}

module.exports = Filters;

},{"./Feature":70}],72:[function(require,module,exports){
'use strict';

var Feature = require('./Feature');

var commands = {
    PAGEDOWN: function(grid) { grid.pageDown(); },
    PAGEUP: function(grid) { grid.pageUp(); },
    PAGELEFT: function(grid) { grid.pageLeft(); },
    PAGERIGHT: function(grid) { grid.pageRight(); }
};

/**
 * @constructor
 */
var KeyPaging = Feature.extend('KeyPaging', {

    /**
     * @param {Hypergrid} grid
     * @param {Object} event - the event details
     * @memberOf KeyPaging.prototype
     */
    handleKeyDown: function(grid, event) {
        var func = commands[event.detail.char];
        if (func) {
            func(grid);
        } else if (this.next) {
            this.next.handleKeyDown(grid, event);
        }
    }

});

module.exports = KeyPaging;

},{"./Feature":70}],73:[function(require,module,exports){
'use strict';

var Feature = require('./Feature');

/**
 * @constructor
 */
var OnHover = Feature.extend('OnHover', {

    /**
     * @param {Hypergrid} grid
     * @param {Object} event - the event details
     * @memberOf OnHover.prototype
     */
    handleMouseMove: function(grid, event) {
        var hoverCell = grid.hoverCell;
        if (!event.gridCell.equals(hoverCell)) {
            if (hoverCell) {
                this.handleMouseExit(grid, hoverCell);
            }
            this.handleMouseEnter(grid, event);
            grid.setHoverCell(event);
        } else if (this.next) {
            this.next.handleMouseMove(grid, event);
        }
    }

});

module.exports = OnHover;

},{"./Feature":70}],74:[function(require,module,exports){
'use strict';

var Feature = require('./Feature');

/**
 * @constructor
 */
var RowSelection = Feature.extend('RowSelection', {

    /**
     * The pixel location of the mouse pointer during a drag operation.
     * @type {Point}
     * @default null
     * @memberOf RowSelection.prototype
     */
    currentDrag: null,

    /**
     * The cell coordinates of the where the mouse pointer is during a drag operation.
     * @type {Object}
     * @default null
     * @memberOf RowSelection.prototype
     */
    lastDragCell: null,

    /**
     * a millisecond value representing the previous time an autoscroll started
     * @type {number}
     * @default 0
     * @memberOf RowSelection.prototype
     */
    sbLastAuto: 0,

    /**
     * a millisecond value representing the time the current autoscroll started
     * @type {number}
     * @default 0
     * @memberOf RowSelection.prototype
     */
    sbAutoStart: 0,

    dragArmed: false,

    /**
     * @memberOf RowSelection.prototype
     * @param {Hypergrid} grid
     * @param {Object} event - the event details
     */
    handleMouseUp: function(grid, event) {
        if (this.dragArmed) {
            this.dragArmed = false;
            grid.fireSyntheticRowSelectionChangedEvent();
        } else if (this.dragging) {
            this.dragging = false;
            grid.fireSyntheticRowSelectionChangedEvent();
        } else if (this.next) {
            this.next.handleMouseUp(grid, event);
        }
    },

    /**
     * @memberOf RowSelection.prototype
     * @param {Hypergrid} grid
     * @param {Object} event - the event details
     */
    handleMouseDown: function(grid, event) {
        var rowSelectable = grid.properties.rowSelection &&
            !event.primitiveEvent.detail.isRightClick &&
            grid.properties.showRowNumbers &&
            event.isHandleColumn;

        if (rowSelectable && event.isHeaderHandle) {
            //global row selection
            grid.toggleSelectAllRows();
        } else if (rowSelectable && event.isDataRow)  {
            // if we are in the fixed area, do not apply the scroll values
            this.dragArmed = true;
            this.extendSelection(grid, event.dataCell.y, event.primitiveEvent.detail.keys);
        } else if (this.next) {
            this.next.handleMouseDown(grid, event);
        }
    },

    /**
     * @memberOf RowSelection.prototype
     * @param {Hypergrid} grid
     * @param {Object} event - the event details
     */
    handleMouseDrag: function(grid, event) {
        if (
            this.dragArmed &&
            grid.properties.rowSelection &&
            !event.primitiveEvent.detail.isRightClick
        ) {
            //if we are in the fixed area do not apply the scroll values
            this.lastDragRow = event.dataCell.y;
            this.dragging = true;
            this.currentDrag = event.primitiveEvent.detail.mouse;
            this.checkDragScroll(grid, this.currentDrag);
            this.handleMouseDragCellSelection(grid, this.lastDragRow, event.primitiveEvent.detail.keys);
        } else if (this.next) {
            this.next.handleMouseDrag(grid, event);
        }
    },

    /**
     * @memberOf RowSelection.prototype
     * @param {Hypergrid} grid
     * @param {Object} event - the event details
     */
    handleKeyDown: function(grid, event) {
        var handler;
        if (
            grid.getLastSelectionType() === 'row' &&
            (handler = this['handle' + event.detail.char])
        ) {
            handler.call(this, grid, event.detail);
        } else if (this.next) {
            this.next.handleKeyDown(grid, event);
        }
    },

    /**
     * @memberOf RowSelection.prototype
     * @desc Handle a mousedrag selection
     * @param {Hypergrid} grid
     * @param {Object} mouse - the event details
     * @param {Array} keys - array of the keys that are currently pressed down
     */
    handleMouseDragCellSelection: function(grid, y, keys) {
        var mouseY = grid.getMouseDown().y;

        grid.clearMostRecentRowSelection();

        grid.selectRow(mouseY, y);
        grid.setDragExtent(grid.newPoint(0, y - mouseY));

        grid.repaint();
    },

    /**
     * @memberOf RowSelection.prototype
     * @desc this checks while were dragging if we go outside the visible bounds, if so, kick off the external autoscroll check function (above)
     * @param {Hypergrid} grid
     * @param {Object} mouse - the event details
     */
    checkDragScroll: function(grid, mouse) {
        if (
            grid.properties.scrollingEnabled &&
            grid.getDataBounds().contains(mouse)
        ) {
            if (grid.isScrollingNow()) {
                grid.setScrollingNow(false);
            }
        } else {
            if (!grid.isScrollingNow()) {
                grid.setScrollingNow(true);
                this.scrollDrag(grid);
            }
        }
    },

    /**
     * @memberOf RowSelection.prototype
     * @desc this function makes sure that while we are dragging outside of the grid visible bounds, we srcroll accordingly
     * @param {Hypergrid} grid
     */
    scrollDrag: function(grid) {
        if (!grid.isScrollingNow()) {
            return;
        }

        var b = grid.getDataBounds(),
            yOffset;

        if (this.currentDrag.y < b.origin.y) {
            yOffset = -1;
        } else if (this.currentDrag.y > b.origin.y + b.extent.y) {
            yOffset = 1;
        }

        if (yOffset) {
            if (this.lastDragRow >= grid.getFixedRowCount()) {
                this.lastDragRow += yOffset;
            }
            grid.scrollBy(0, yOffset);
        }

        this.handleMouseDragCellSelection(grid, this.lastDragRow, []); // update the selection
        grid.repaint();
        setTimeout(this.scrollDrag.bind(this, grid), 25);
    },

    /**
     * @memberOf RowSelection.prototype
     * @desc extend a selection or create one if there isnt yet
     * @param {Hypergrid} grid
     * @param {Object} gridCell - the event details
     * @param {Array} keys - array of the keys that are currently pressed down
     */
    extendSelection: function(grid, y, keys) {
        if (!grid.abortEditing()) { return; }

        var mouseY = grid.getMouseDown().y,
            hasSHIFT = keys.indexOf('SHIFT') !== -1;

        if (y < 0) { // outside of the grid?
            return; // do nothing
        }

        if (hasSHIFT) {
            grid.clearMostRecentRowSelection();
            grid.selectRow(y, mouseY);
            grid.setDragExtent(grid.newPoint(0, y - mouseY));
        } else {
            grid.toggleSelectRow(y, keys);
            grid.setMouseDown(grid.newPoint(0, y));
            grid.setDragExtent(grid.newPoint(0, 0));
        }

        grid.repaint();
    },


    /**
     * @memberOf RowSelection.prototype
     * @param {Hypergrid} grid
     */
    handleDOWNSHIFT: function(grid) {
        this.moveShiftSelect(grid, 1);
    },

    /**
     * @memberOf RowSelection.prototype
     * @param {Hypergrid} grid
     * @param {Object} event - the event details
     */
    handleUPSHIFT: function(grid) {
        this.moveShiftSelect(grid, -1);
    },

    /**
     * @memberOf RowSelection.prototype
     * @param {Hypergrid} grid
     * @param {Object} event - the event details
     */
    handleLEFTSHIFT: function(grid) {},

    /**
     * @memberOf RowSelection.prototype
     * @param {Hypergrid} grid
     * @param {Object} event - the event details
     */
    handleRIGHTSHIFT: function(grid) {},

    /**
     * @memberOf RowSelection.prototype
     * @param {Hypergrid} grid
     * @param {Object} event - the event details
     */
    handleDOWN: function(grid) {
        this.moveSingleSelect(grid, 1);
    },

    /**
     * @memberOf RowSelection.prototype
     * @param {Hypergrid} grid
     * @param {Object} event - the event details
     */
    handleUP: function(grid) {
        this.moveSingleSelect(grid, -1);
    },

    /**
     * @memberOf RowSelection.prototype
     * @param {Hypergrid} grid
     * @param {Object} event - the event details
     */
    handleLEFT: function(grid) {},

    /**
     * @memberOf RowSelection.prototype
     * @param {Hypergrid} grid
     * @param {Object} event - the event details
     */
    handleRIGHT: function(grid) {
        var mouseCorner = grid.getMouseDown().plus(grid.getDragExtent()),
            maxColumns = grid.getColumnCount() - 1,
            newX = grid.getHScrollValue(),
            newY = mouseCorner.y;

        newX = Math.min(maxColumns, newX);

        grid.clearSelections();
        grid.select(newX, newY, 0, 0);
        grid.setMouseDown(grid.newPoint(newX, newY));
        grid.setDragExtent(grid.newPoint(0, 0));

        grid.repaint();
    },

    /**
     * @memberOf RowSelection.prototype
     * @desc If we are holding down the same navigation key, accelerate the increment we scroll
     * #### returns: integer
     */
    getAutoScrollAcceleration: function() {
        var count = 1;
        var elapsed = this.getAutoScrollDuration() / 2000;
        count = Math.max(1, Math.floor(elapsed * elapsed * elapsed * elapsed));
        return count;
    },

    /**
     * @memberOf RowSelection.prototype
     * @desc set the start time to right now when we initiate an auto scroll
     */
    setAutoScrollStartTime: function() {
        this.sbAutoStart = Date.now();
    },

    /**
     * @memberOf RowSelection.prototype
     * @desc update the autoscroll start time if we haven't autoscrolled within the last 500ms otherwise update the current autoscroll time
     */
    pingAutoScroll: function() {
        var now = Date.now();
        if (now - this.sbLastAuto > 500) {
            this.setAutoScrollStartTime();
        }
        this.sbLastAuto = Date.now();
    },

    /**
     * @memberOf RowSelection.prototype
     * @desc answer how long we have been auto scrolling
     * #### returns: integer
     */
    getAutoScrollDuration: function() {
        if (Date.now() - this.sbLastAuto > 500) {
            return 0;
        }
        return Date.now() - this.sbAutoStart;
    },

    /**
     * @memberOf RowSelection.prototype
     * @desc Augment the most recent selection extent by (offsetX,offsetY) and scroll if necessary.
     * @param {Hypergrid} grid
     * @param {number} offsetX - x coordinate to start at
     * @param {number} offsetY - y coordinate to start at
     */
    moveShiftSelect: function(grid, offsetY) {
        var origin = grid.getMouseDown(),
            extent = grid.getDragExtent(),
            maxViewableRows = grid.renderer.visibleRows.length - 1,
            maxRows = grid.getRowCount() - 1;

        if (!grid.properties.scrollingEnabled) {
            maxRows = Math.min(maxRows, maxViewableRows);
        }

        var newY = extent.y + offsetY;

        newY = Math.min(maxRows - origin.y, Math.max(-origin.y, newY));

        grid.clearMostRecentRowSelection();
        grid.selectRow(origin.y, origin.y + newY);
        grid.setDragExtent(grid.newPoint(0, newY));

        if (grid.insureModelRowIsVisible(newY + origin.y, offsetY)) {
            this.pingAutoScroll();
        }

        grid.fireSyntheticRowSelectionChangedEvent();

        grid.repaint();
    },

    /**
     * @memberOf RowSelection.prototype
     * @desc Replace the most recent selection with a single cell selection that is moved (offsetX,offsetY) from the previous selection extent.
     * @param {Hypergrid} grid
     * @param {number} offsetX - x coordinate to start at
     * @param {number} offsetY - y coordinate to start at
     */
    moveSingleSelect: function(grid, offsetY) {
        var maxRows = grid.getRowCount() - 1,
            maxViewableRows = grid.getVisibleRowsCount() - 1,
            mouseCorner = grid.getMouseDown().plus(grid.getDragExtent()),
            newY = mouseCorner.y + offsetY;

        if (!grid.properties.scrollingEnabled) {
            maxRows = Math.min(maxRows, maxViewableRows);
        }

        newY = Math.min(maxRows, Math.max(0, newY));

        grid.clearSelections();
        grid.selectRow(newY);
        grid.setMouseDown(grid.newPoint(0, newY));
        grid.setDragExtent(grid.newPoint(0, 0));

        if (grid.insureModelRowIsVisible(newY, offsetY)) {
            this.pingAutoScroll();
        }

        grid.fireSyntheticRowSelectionChangedEvent();
        grid.repaint();
    },

    isSingleRowSelection: function() {
        return true;
    }

});

module.exports = RowSelection;

},{"./Feature":70}],75:[function(require,module,exports){
'use strict';

var Feature = require('./Feature');

/**
 * @constructor
 */
var ThumbwheelScrolling = Feature.extend('ThumbwheelScrolling', {

    /**
     * @memberOf ThumbwheelScrolling.prototype
     * @param {Hypergrid} grid
     * @param {Object} event - the event details
     */
    handleWheelMoved: function(grid, e) {
        if (!grid.properties.scrollingEnabled) {
            return;
        }

        var primEvent = e.primitiveEvent,
            deltaX = Math.sign(primEvent.wheelDeltaX || -primEvent.deltaX),
            deltaY = Math.sign(primEvent.wheelDeltaY || -primEvent.deltaY);

        if (deltaX || deltaY) {
            grid.scrollBy(
                -deltaX || 0, // 0 if NaN
                -deltaY || 0
            );
        }
    }

});


module.exports = ThumbwheelScrolling;

},{"./Feature":70}],76:[function(require,module,exports){
'use strict';

var Registry = require('../lib/Registry');


/**
 * @classdesc Registry of feature constructors.
 * @param {boolean} [privateRegistry=false] - This instance will use a private registry.
 * @constructor
 */
var Features = Registry.extend('Features', {

    BaseClass: require('./Feature'), // abstract base class

    items: {}, // shared feature registry (when !options.private)

    initialize: function(options) {
        // preregister the standard cell renderers
        if (options && options.private || !this.items.cellclick) {
            this.add(require('./CellClick'));
            this.add(require('./CellEditing'));
            this.add(require('./CellSelection'));
            this.add(require('./ColumnMoving'));
            this.add(require('./ColumnResizing'));
            this.add(require('./ColumnSelection'));
            this.add(require('./ColumnSorting'));
            this.add(require('./Filters'));
            this.add(require('./KeyPaging'));
            this.add(require('./OnHover'));
            // this.add(require('./RowResizing'));
            this.add(require('./RowSelection'));
            this.add(require('./ThumbwheelScrolling'));
        }
    }

});

Features.add = Registry.prototype.add.bind(Features);


// Following shared props provided solely in support of build file usage, e.g., `fin.Hypergrid.features.yada`,
// and are not meant to be used elsewhere.

Features.Feature = require('./Feature'); // abstract base class
Features.CellClick = require('./CellClick');
Features.CellEditing = require('./CellEditing');
Features.CellSelection = require('./CellSelection');
Features.ColumnMoving = require('./ColumnMoving');
Features.ColumnResizing = require('./ColumnResizing');
Features.ColumnSelection = require('./ColumnSelection');
Features.ColumnSorting = require('./ColumnSorting');
Features.Filters = require('./Filters');
Features.KeyPaging = require('./KeyPaging');
Features.OnHover = require('./OnHover');
// Features.RowResizing = require('./RowResizing');
Features.RowSelection = require('./RowSelection');
Features.ThumbwheelScrolling = require('./ThumbwheelScrolling');


module.exports = Features;

},{"../lib/Registry":80,"./CellClick":63,"./CellEditing":64,"./CellSelection":65,"./ColumnMoving":66,"./ColumnResizing":67,"./ColumnSelection":68,"./ColumnSorting":69,"./Feature":70,"./Filters":71,"./KeyPaging":72,"./OnHover":73,"./RowSelection":74,"./ThumbwheelScrolling":75}],77:[function(require,module,exports){
/* eslint-env browser */

'use strict';

if (typeof window.CustomEvent !== 'function') {
    window.CustomEvent = function(event, params) {
        params = params || { bubbles: false, cancelable: false, detail: undefined };
        var evt = document.createEvent('CustomEvent');
        evt.initCustomEvent(event, params.bubbles, params.cancelable, params.detail);
        return evt;
    };

    window.CustomEvent.prototype = window.Event.prototype;
}

var rectangular = require('rectangular');

var RESIZE_POLLING_INTERVAL = 200,
    paintables = [],
    resizables = [],
    paintRequest,
    resizeInterval,
    charMap = makeCharMap();

function Canvas(div, component) {
    var self = this;

    // create the containing <div>...</div>
    this.div = div;
    this.component = component;

    this.dragEndtime = Date.now();

    // create and append the info <div>...</div> (to be displayed when there are no data rows)
    this.infoDiv = document.createElement('div');
    this.infoDiv.className = 'info';
    this.div.appendChild(this.infoDiv);

    // create and append the canvas
    this.gc = getCachedContext(this.canvas = document.createElement('canvas'));
    this.bc = getCachedContext(this.buffer = document.createElement('canvas'));

    this.div.appendChild(this.canvas);

    this.canvas.style.outline = 'none';

    this.mouseLocation = new rectangular.Point(-1, -1);
    this.dragstart = new rectangular.Point(-1, -1);
    //this.origin = new rectangular.Point(0, 0);
    this.bounds = new rectangular.Rectangle(0, 0, 0, 0);
    this.hasMouse = false;

    document.addEventListener('mousemove', function(e) {
        if (self.hasMouse || self.isDragging()) {
            self.finmousemove(e);
        }
    });
    document.addEventListener('mouseup', function(e) {
        self.finmouseup(e);
    });
    document.addEventListener('wheel', function(e) {
        self.finwheelmoved(e);
    });
    document.addEventListener('keydown', function(e) {
        self.finkeydown(e);
    });
    document.addEventListener('keyup', function(e) {
        self.finkeyup(e);
    });

    this.canvas.onmouseover = function() {
        self.hasMouse = true;
    };
    this.addEventListener('focus', function(e) {
        self.finfocusgained(e);
    });
    this.addEventListener('blur', function(e) {
        self.finfocuslost(e);
    });
    this.addEventListener('mousedown', function(e) {
        self.finmousedown(e);
    });
    this.addEventListener('mouseout', function(e) {
        self.hasMouse = false;
        self.finmouseout(e);
    });
    this.addEventListener('click', function(e) {
        self.finclick(e);
    });
    this.addEventListener('dblclick', function(e) {
        self.findblclick(e);
    });
    this.addEventListener('contextmenu', function(e) {
        self.fincontextmenu(e);
        e.preventDefault();
        return false;
    });

    this.canvas.setAttribute('tabindex', 0);

    this.resize();

    this.beginResizing();
    this.beginPainting();
}

Canvas.prototype = {
    constructor: Canvas.prototype.constructor,
    div: null,
    component: null,
    canvas: null,
    focuser: null,
    buffer: null,
    ctx: null,
    mouseLocation: null,
    dragstart: null,
    origin: null,
    bounds: null,
    dirty: false,
    size: null,
    mousedown: false,
    dragging: false,
    repeatKeyCount: 0,
    repeatKey: null,
    repeatKeyStartTime: 0,
    currentKeys: [],
    hasMouse: false,
    dragEndTime: 0,
    lastRepaintTime: 0,
    currentPaintCount: 0,
    currentFPS: 0,
    lastFPSComputeTime: 0,

    addEventListener: function(name, callback) {
        this.canvas.addEventListener(name, callback);
    },

    removeEventListener: function(name, callback) {
        this.canvas.removeEventListener(name, callback);
    },

    stopPaintLoop: stopPaintLoop,
    restartPaintLoop: restartPaintLoop,

    stopResizeLoop: stopResizeLoop,
    restartResizeLoop: restartResizeLoop,

    detached: function() {
        this.stopPainting();
        this.stopResizing();
    },

    getCurrentFPS:function() {
        return this.currentFPS;
    },


    tickPaint: function(now) {
        var isContinuousRepaint = this.component.properties.enableContinuousRepaint,
            fps = this.component.properties.repaintIntervalRate;
        if (fps === 0) {
            return;
        }
        var interval = 1000 / fps;

        var elapsed = now - this.lastRepaintTime;
        if (elapsed > interval && (isContinuousRepaint || this.dirty)) {
            this.paintNow();
            this.lastRepaintTime = now;
            /* - (elapsed % interval);*/
            if (isContinuousRepaint) {
                this.currentPaintCount++;
                if (now - this.lastFPSComputeTime >= 1000) {
                    this.currentFPS = (this.currentPaintCount * 1000) / (now - this.lastFPSComputeTime);
                    this.currentPaintCount = 0;
                    this.lastFPSComputeTime = now;
                }
            }
        }
    },

    beginPainting: function() {
        var self = this;
        this.dirty = true;
        this.tickPainter = function(now) {
            self.tickPaint(now);
        };
        paintables.push(this);
    },

    stopPainting: function() {
        paintables.splice(paintables.indexOf(this), 1);
    },

    beginResizing: function() {
        var self = this;
        this.tickResizer = function() {
            self.checksize();
        };
        resizables.push(this);
    },

    stopResizing: function() {
        resizables.splice(resizables.indexOf(this), 1);
    },

    start: function() {
        this.beginPainting();
        this.beginResizing();
    },

    stop: function() {
        this.stopPainting();
        this.stopResizing();
    },

    getDivBoundingClientRect: function() {
        // Make sure our canvas has integral dimensions
        var rect = this.div.getBoundingClientRect();
        var top = Math.floor(rect.top),
            left = Math.floor(rect.left),
            width = Math.ceil(rect.width),
            height = Math.ceil(rect.height);

        return {
            top: top,
            right: left + width,
            bottom: top + height,
            left: left,
            width: width,
            height: height,
            x: rect.x,
            y: rect.y
        };
    },

    checksize: function() {
        //this is expensive lets do it at some modulo
        var sizeNow = this.getDivBoundingClientRect();
        if (sizeNow.width !== this.size.width || sizeNow.height !== this.size.height) {
            this.resize();
        }
    },

    resize: function() {
        var box = this.size = this.getDivBoundingClientRect();

        this.width = box.width;
        this.height = box.height;

        //fix ala sir spinka, see
        //http://www.html5rocks.com/en/tutorials/canvas/hidpi/
        //just add 'hdpi' as an attribute to the fin-canvas tag
        var ratio = 1;
        var isHIDPI = window.devicePixelRatio && this.component.properties.useHiDPI;
        if (isHIDPI) {
            var devicePixelRatio = window.devicePixelRatio || 1;
            var backingStoreRatio = this.gc.webkitBackingStorePixelRatio ||
                this.gc.mozBackingStorePixelRatio ||
                this.gc.msBackingStorePixelRatio ||
                this.gc.oBackingStorePixelRatio ||
                this.gc.backingStorePixelRatio || 1;

            ratio = devicePixelRatio / backingStoreRatio;
            //this.canvasCTX.scale(ratio, ratio);
        }

        this.buffer.width = this.canvas.width = this.width * ratio;
        this.buffer.height = this.canvas.height = this.height * ratio;

        this.canvas.style.width = this.buffer.style.width = this.width + 'px';
        this.canvas.style.height = this.buffer.style.height = this.height + 'px';

        this.bc.scale(ratio, ratio);
        if (isHIDPI && !this.component.properties.useBitBlit) {
            this.gc.scale(ratio, ratio);
        }

        this.bounds = new rectangular.Rectangle(0, 0, this.width, this.height);
        this.component.setBounds(this.bounds);
        this.resizeNotification();
        this.paintNow();
    },

    resizeNotification: function() {
        this.dispatchNewEvent(undefined, 'fin-canvas-resized', {
            width: this.width,
            height: this.height
        });
    },

    getBounds: function() {
        return this.bounds;
    },

    paintNow: function() {
        var useBitBlit = this.component.properties.useBitBlit,
            gc = useBitBlit ? this.bc : this.gc;

        try {
            gc.cache.save();
            this.component.paint(gc);
            this.dirty = false;
        } catch (e) {
            console.error(e);
        } finally {
            gc.cache.restore();
        }

        if (useBitBlit) {
            this.flushBuffer();
        }
    },

    flushBuffer: function() {
        if (this.buffer.width > 0 && this.buffer.height > 0) {
            this.gc.drawImage(this.buffer, 0, 0);
        }
    },

    newEvent: function(primitiveEvent, name, detail) {
        var event = {
            detail: detail || {}
        };
        if (primitiveEvent) {
            event.detail.primitiveEvent = primitiveEvent;
        }
        return new CustomEvent(name, event);
    },

    dispatchNewEvent: function(primitiveEvent, name, detail) {
        return this.canvas.dispatchEvent(this.newEvent(primitiveEvent, name, detail));
    },

    dispatchNewMouseKeysEvent: function(event, name, detail) {
        detail = detail || {};
        detail.mouse = this.mouseLocation;
        detail.keys = this.currentKeys;
        return this.dispatchNewEvent(event, name, detail);
    },

    finmousemove: function(e) {
        if (!this.isDragging() && this.mousedown) {
            this.beDragging();
            this.dispatchNewMouseKeysEvent(e, 'fin-canvas-dragstart', {
                isRightClick: this.isRightClick(e),
                dragstart: this.dragstart
            });
            this.dragstart = new rectangular.Point(this.mouseLocation.x, this.mouseLocation.y);
        }
        this.mouseLocation = this.getLocal(e);
        //console.log(this.mouseLocation);
        if (this.isDragging()) {
            this.dispatchNewMouseKeysEvent(e, 'fin-canvas-drag', {
                dragstart: this.dragstart,
                isRightClick: this.isRightClick(e)
            });
        }
        if (this.bounds.contains(this.mouseLocation)) {
            this.dispatchNewMouseKeysEvent(e, 'fin-canvas-mousemove');
        }
    },

    finmousedown: function(e) {
        this.mouseLocation = this.mouseDownLocation = this.getLocal(e);
        this.mousedown = true;

        this.dispatchNewMouseKeysEvent(e, 'fin-canvas-mousedown', {
            isRightClick: this.isRightClick(e)
        });
        this.takeFocus();
    },

    finmouseup: function(e) {
        if (!this.mousedown) {
            // ignore document:mouseup unless preceded by a canvas:mousedown
            return;
        }
        if (this.isDragging()) {
            this.dispatchNewMouseKeysEvent(e, 'fin-canvas-dragend', {
                dragstart: this.dragstart,
                isRightClick: this.isRightClick(e)
            });
            this.beNotDragging();
            this.dragEndtime = Date.now();
        }
        this.mousedown = false;
        this.dispatchNewMouseKeysEvent(e, 'fin-canvas-mouseup', {
            dragstart: this.dragstart,
            isRightClick: this.isRightClick(e)
        });
        //this.mouseLocation = new rectangular.Point(-1, -1);
    },

    finmouseout: function(e) {
        if (!this.mousedown) {
            this.mouseLocation = new rectangular.Point(-1, -1);
        }
        this.repaint();
        this.dispatchNewMouseKeysEvent(e, 'fin-canvas-mouseout', {
            dragstart: this.dragstart
        });
    },

    finwheelmoved: function(e) {
        if (this.isDragging() || !this.hasFocus()) {
            return;
        }
        e.preventDefault();
        this.dispatchNewMouseKeysEvent(e, 'fin-canvas-wheelmoved', {
            isRightClick: this.isRightClick(e)
        });
    },

    finclick: function(e) {
        this.mouseLocation = this.getLocal(e);
        this.dispatchNewMouseKeysEvent(e, 'fin-canvas-click', {
            isRightClick: this.isRightClick(e)
        });
    },

    findblclick: function(e) {
        this.mouseLocation = this.getLocal(e);
        this.dispatchNewMouseKeysEvent(e, 'fin-canvas-dblclick', {
            isRightClick: this.isRightClick(e)
        });
    },

    getCharMap: function() {
        return charMap;
    },

    getKeyChar: function(e) {
        var key = e.keyCode || e.detail.key,
            shift = e.shiftKey || e.detail.shift;
        return charMap[key][shift ? 1 : 0];
    },

    finkeydown: function(e) {
        if (!this.hasFocus()) {
            return;
        }

        // prevent TAB from moving focus off the canvas element
        if (e.keyCode === 9) {
            e.preventDefault();
        }

        var keyChar = this.getKeyChar(e);
        if (e.repeat) {
            if (this.repeatKey === keyChar) {
                this.repeatKeyCount++;
            } else {
                this.repeatKey = keyChar;
                this.repeatKeyStartTime = Date.now();
            }
        } else {
            this.repeatKey = null;
            this.repeatKeyCount = 0;
            this.repeatKeyStartTime = 0;
        }
        if (this.currentKeys.indexOf(keyChar) === -1) {
            this.currentKeys.push(keyChar);
        }

        this.dispatchNewEvent(e, 'fin-canvas-keydown', {
            alt: e.altKey,
            ctrl: e.ctrlKey,
            char: keyChar,
            code: e.charCode,
            key: e.keyCode,
            meta: e.metaKey,
            repeatCount: this.repeatKeyCount,
            repeatStartTime: this.repeatKeyStartTime,
            shift: e.shiftKey,
            identifier: e.key,
            currentKeys: this.currentKeys.slice(0)
        });
    },

    finkeyup: function(e) {
        if (!this.hasFocus()) {
            return;
        }

        // prevent TAB from moving focus off the canvas element
        if (e.keyCode === 9) {
            e.preventDefault();
        }

        var keyChar = this.getKeyChar(e);
        this.currentKeys.splice(this.currentKeys.indexOf(keyChar), 1);
        this.repeatKeyCount = 0;
        this.repeatKey = null;
        this.repeatKeyStartTime = 0;
        this.dispatchNewEvent(e, 'fin-canvas-keyup', {
            alt: e.altKey,
            ctrl: e.ctrlKey,
            char: keyChar,
            code: e.charCode,
            key: e.keyCode,
            meta: e.metaKey,
            repeat: e.repeat,
            shift: e.shiftKey,
            identifier: e.key,
            currentKeys: this.currentKeys.slice(0)
        });
    },

    finfocusgained: function(e) {
        this.dispatchNewEvent(e, 'fin-canvas-focus-gained');
    },

    finfocuslost: function(e) {
        this.dispatchNewEvent(e, 'fin-canvas-focus-lost');
    },

    fincontextmenu: function(e) {
        if (e.ctrlKey && this.currentKeys.indexOf('CTRL') === -1) {
            this.currentKeys.push('CTRL');
        }

        this.dispatchNewMouseKeysEvent(e, 'fin-canvas-context-menu', {
            isRightClick: this.isRightClick(e)
        });
    },

    repaint: function() {
        this.dirty = true;
        if (!paintRequest || this.component.properties.repaintIntervalRate === 0) {
            this.paintNow();
        }
    },

    getMouseLocation: function() {
        return this.mouseLocation;
    },

    getOrigin: function() {
        var rect = this.canvas.getBoundingClientRect();
        var p = new rectangular.Point(rect.left, rect.top);
        return p;
    },

    getLocal: function(e) {
        var rect = this.canvas.getBoundingClientRect();
        var p = new rectangular.Point(e.clientX - rect.left, e.clientY - rect.top);
        return p;
    },

    hasFocus: function() {
        return document.activeElement === this.canvas;
    },

    takeFocus: function() {
        var self = this;
        if (!this.hasFocus()) {
            setTimeout(function() {
                self.canvas.focus();
            }, 10);
        }
    },

    beDragging: function() {
        this.dragging = true;
        this.disableDocumentElementSelection();
    },

    beNotDragging: function() {
        this.dragging = false;
        this.enableDocumentElementSelection();
    },

    isDragging: function() {
        return this.dragging;
    },

    disableDocumentElementSelection: function() {
        var style = document.body.style;
        style.cssText = style.cssText + '-webkit-user-select: none';
    },

    enableDocumentElementSelection: function() {
        var style = document.body.style;
        style.cssText = style.cssText.replace('-webkit-user-select: none', '');
    },

    setFocusable: function(truthy) {
        this.focuser.style.display = truthy ? '' : 'none';
    },

    isRightClick: function(e) {
        var isRightMB;
        e = e || window.event;

        if ('which' in e) { // Gecko (Firefox), WebKit (Safari/Chrome) & Opera
            isRightMB = e.which === 3;
        } else if ('button' in e) { // IE, Opera
            isRightMB = e.button === 2;
        }
        return isRightMB;
    },

    dispatchEvent: function(e) {
        return this.canvas.dispatchEvent(e);
    },

    setInfo: function(message, width) {
        if (message) {
            if (width !== undefined) {
                if (width && !isNaN(Number(width))) {
                    width += 'px';
                }
                this.infoDiv.style.width = width;
            }

            if (message.indexOf('<')) {
                this.infoDiv.innerHTML = message;
            } else {
                this.infoDiv.innerText = message;
            }
        }

        this.infoDiv.style.display = message ? 'block' : 'none';
    }
};

function paintLoopFunction(now) {
    if (paintRequest) {
        paintables.forEach(function(paintable) {
            try {
                paintable.tickPainter(now);
            } catch (e) {
                console.error(e);
            }

            if (paintable.component.tickNotification) {
                paintable.component.tickNotification();
            }
        });
        paintRequest = requestAnimationFrame(paintLoopFunction);
    }
}
function restartPaintLoop() {
    paintRequest = paintRequest || requestAnimationFrame(paintLoopFunction);
}
function stopPaintLoop() {
    if (paintRequest) {
        cancelAnimationFrame(paintRequest);
        paintRequest = undefined;
    }
}
restartPaintLoop();

function resizablesLoopFunction(now) {
    if (resizeInterval) {
        for (var i = 0; i < resizables.length; i++) {
            try {
                resizables[i].tickResizer(now);
            } catch (e) {
                console.error(e);
            }
        }
    }
}
function restartResizeLoop() {
    resizeInterval = resizeInterval || setInterval(resizablesLoopFunction, RESIZE_POLLING_INTERVAL);
}
function stopResizeLoop() {
    if (resizeInterval) {
        clearInterval(resizeInterval);
        resizeInterval = undefined;
    }
}
restartResizeLoop();

function makeCharMap() {
    var map = [];

    var empty = ['', ''];

    for (var i = 0; i < 256; i++) {
        map[i] = empty;
    }

    map[27] = ['ESC', 'ESCSHIFT'];
    map[192] = ['`', '~'];
    map[49] = ['1', '!'];
    map[50] = ['2', '@'];
    map[51] = ['3', '#'];
    map[52] = ['4', '$'];
    map[53] = ['5', '%'];
    map[54] = ['6', '^'];
    map[55] = ['7', '&'];
    map[56] = ['8', '*'];
    map[57] = ['9', '('];
    map[48] = ['0', ')'];
    map[189] = ['-', '_'];
    map[187] = ['=', '+'];
    map[8] = ['BACKSPACE', 'BACKSPACESHIFT'];
    map[46] = ['DELETE', 'DELETESHIFT'];
    map[9] = ['TAB', 'TABSHIFT'];
    map[81] = ['q', 'Q'];
    map[87] = ['w', 'W'];
    map[69] = ['e', 'E'];
    map[82] = ['r', 'R'];
    map[84] = ['t', 'T'];
    map[89] = ['y', 'Y'];
    map[85] = ['u', 'U'];
    map[73] = ['i', 'I'];
    map[79] = ['o', 'O'];
    map[80] = ['p', 'P'];
    map[219] = ['[', '{'];
    map[221] = [']', '}'];
    map[220] = ['\\', '|'];
    map[220] = ['CAPSLOCK', 'CAPSLOCKSHIFT'];
    map[65] = ['a', 'A'];
    map[83] = ['s', 'S'];
    map[68] = ['d', 'D'];
    map[70] = ['f', 'F'];
    map[71] = ['g', 'G'];
    map[72] = ['h', 'H'];
    map[74] = ['j', 'J'];
    map[75] = ['k', 'K'];
    map[76] = ['l', 'L'];
    map[186] = [';', ':'];
    map[222] = ['\'', '|'];
    map[13] = ['RETURN', 'RETURNSHIFT'];
    map[16] = ['SHIFT', 'SHIFT'];
    map[90] = ['z', 'Z'];
    map[88] = ['x', 'X'];
    map[67] = ['c', 'C'];
    map[86] = ['v', 'V'];
    map[66] = ['b', 'B'];
    map[78] = ['n', 'N'];
    map[77] = ['m', 'M'];
    map[188] = [',', '<'];
    map[190] = ['.', '>'];
    map[191] = ['/', '?'];
    map[16] = ['SHIFT', 'SHIFT'];
    map[17] = ['CTRL', 'CTRLSHIFT'];
    map[18] = ['ALT', 'ALTSHIFT'];
    map[91] = ['COMMANDLEFT', 'COMMANDLEFTSHIFT'];
    map[32] = ['SPACE', 'SPACESHIFT'];
    map[93] = ['COMMANDRIGHT', 'COMMANDRIGHTSHIFT'];
    map[18] = ['ALT', 'ALTSHIFT'];
    map[38] = ['UP', 'UPSHIFT'];
    map[37] = ['LEFT', 'LEFTSHIFT'];
    map[40] = ['DOWN', 'DOWNSHIFT'];
    map[39] = ['RIGHT', 'RIGHTSHIFT'];

    map[33] = ['PAGEUP', 'PAGEUPSHIFT'];
    map[34] = ['PAGEDOWN', 'PAGEDOWNSHIFT'];
    map[35] = ['PAGERIGHT', 'PAGERIGHTSHIFT']; // END
    map[36] = ['PAGELEFT', 'PAGELEFTSHIFT']; // HOME

    map[112] = ['F1', 'F1SHIFT'];
    map[113] = ['F2', 'F2SHIFT'];
    map[114] = ['F3', 'F3SHIFT'];
    map[115] = ['F4', 'F4SHIFT'];
    map[116] = ['F5', 'F5SHIFT'];
    map[117] = ['F6', 'F6SHIFT'];
    map[118] = ['F7', 'F7SHIFT'];
    map[119] = ['F8', 'F8SHIFT'];
    map[120] = ['F9', 'F9SHIFT'];
    map[121] = ['F10', 'F10SHIFT'];
    map[122] = ['F11', 'F11SHIFT'];
    map[123] = ['F12', 'F12SHIFT'];

    return map;
}

function getCachedContext(canvasElement, type) {
    var gc = canvasElement.getContext(type || '2d'),
        props = {},
        values = {};

    // Stub out all the prototype members of the canvas 2D graphics context:
    Object.keys(Object.getPrototypeOf(gc)).forEach(makeStub);

    // Some older browsers (e.g., Chrome 40) did not have all members of canvas
    // 2D graphics context in the prototype so we make this additional call:
    Object.keys(gc).forEach(makeStub);

    function makeStub(key) {
        if (
            !(key in props) &&
            !/^(webkit|moz|ms|o)[A-Z]/.test(key) &&
            typeof gc[key] !== 'function'
        ) {
            Object.defineProperty(props, key, {
                get: function() {
                    return (values[key] = values[key] || gc[key]);
                },
                set: function(value) {
                    if (value !== values[key]) {
                        gc[key] = values[key] = value;
                    }
                }
            });
        }
    }

    gc.cache = props;

    gc.cache.save = function() {
        gc.save();
        values = Object.create(values);
    };

    gc.cache.restore = function() {
        gc.restore();
        values = Object.getPrototypeOf(values);
    };

    gc.conditionalsStack = [];

    Object.getOwnPropertyNames(Canvas.graphicsContextAliases).forEach(function(alias) {
        gc[alias] = gc[Canvas.graphicsContextAliases[alias]];
    });

    return Object.assign(gc, require('./graphics'));
}

Canvas.graphicsContextAliases = {
    simpleText: 'fillText'
};


module.exports = Canvas;

},{"./graphics":87,"rectangular":22}],78:[function(require,module,exports){
/* eslint-env browser */

/** @module effects */

/** @typedef {function} effectFunction
 * @desc Element to perform transitions upon is `options.el` if defined or `this.el`.
 * @param {object} [options]
 * @param {HTMLElement} [options.el=this.el]
 * @param {function} [options.callback] Function to call at conclusion of transitions.
 * @param {string} [options.duration='0.065s'] - Duration of each transition.
 * @param {object} [options.styles=defaultGlowerStyles] - Hash of CSS styles and values to transition. (For {@link effects~glower|glower} only.
 */

'use strict';

/**
 * Shake element back and fourth a few times as if to say, "Nope!"
 * @type {effectFunction}
 * @memberOf module:effects
 */
exports.shaker = function(options) {
    options = options || {};
    var context = this,
        el = options.el || context.el,
        duration = options.duration || '0.065s',
        computedStyle = window.getComputedStyle(el),
        transitions = computedStyle.transition.split(','),
        position = computedStyle.position,
        x = parseInt(computedStyle.left),
        dx = -3,
        shakes = 6;

    transitions.push('left ' + duration);
    el.style.transition = transitions.join(',');
    el.addEventListener('transitionend', shaker);
    shaker();
    function shaker(event) {
        if (!event || event.propertyName === 'left') {
            el.style.left = x + dx + 'px';
            if (!shakes--) {
                el.removeEventListener('transitionend', shaker);
                transitions.pop();
                el.style.transition = transitions.join(',');
                el.style.position = position;
                if (options.callback) {
                    options.callback.call(context, options);
                }
            }
            dx = shakes ? -dx : 0;
        }
    }
};

var defaultGlowerStyles = {
    'background-color': 'yellow',
    'box-shadow': '0 0 10px red'
};

/**
 * Transition styles on element for a moment and revert as if to say, "Whoa!."
 * @type {effectFunction}
 * @memberOf module:effects
 */
exports.glower = function(options) {
    options = options || {};
    var context = this,
        el = options.el || context.el,
        duration = options.duration || '0.25s',
        styles = options.styles || defaultGlowerStyles,
        values = styles.length,
        computedStyle = window.getComputedStyle(el),
        styleWas = {},
        transition = computedStyle.transition,
        transitions = transition.split(',');

    Object.keys(styles).forEach(function(style) {
        styleWas[style] = {
            style: computedStyle[style],
            undo: true
        };
        transitions.push(style + ' ' + duration);
    });

    el.style.transition = transitions.join(',');
    el.addEventListener('transitionend', glower);
    Object.keys(styles).forEach(function(style) {
        el.style[style] = styles[style];
    });

    function glower(event) {
        var was = styleWas[event.propertyName];
        if (was.undo) {
            el.style[event.propertyName] = was.style;
            was.undo = false;
        } else if (!--values) {
            el.removeEventListener('transitionend', glower);
            el.style.transition = transition;
            if (options.callback) {
                options.callback.call(context, options);
            }
        }
    }
};

},{}],79:[function(require,module,exports){
/* eslint-env browser */

/**
 * @module localization
 */

'use strict';

var Base = require('../Base');


/**
 * @param {string} defaultLocale
 * @param {string} [locale=defaultlocale]
 * @param {object} [options]
 * @constructor
 */
var Formatter = Base.extend({
    initialize: function(defaultLocale, locale, options) {
        if (typeof locale === 'object') {
            options = locale;
            locale = defaultLocale;
        }

        this.locale = locale;

        if (options) {
            if (typeof options.invalid === 'function') {
                this.invalid = options.invalid;
            }

            if (options.expectation) {
                this.expectation = options.expectation;
            }
        }
    }
});


// Safari has no Intl implementation
if (!window.Intl) {
    window.Intl = {
        NumberFormat: function(locale, options) {
            var digits = '0123456789';
            this.format = function(n) {
                var s = n.toString();
                if (!options || options.useGrouping === undefined || options.useGrouping) {
                    var dp = s.indexOf('.');
                    if (dp < 0) {
                        dp = s.length;
                    }
                    while ((dp -= 3) > 0 && digits.indexOf(s[dp - 1]) >= 0) {
                        s = s.substr(0, dp) + ',' + s.substr(dp);
                    }
                }
                return s;
            };
        },
        DateTimeFormat: function(locale, options) {
            this.format = function(date) {
                if (date != null) {
                    if (typeof date !== 'object') {
                        date = new Date(date);
                    }
                    date = date.getMonth() + 1 + '-' + date.getDate() + '-' + date.getFullYear();
                } else {
                    date = null;
                }
                return date;
            };
        }
    };
}


/**
 * @summary Create a number localizer.
 * @implements localizerInterface
 * @desc Create an object conforming to {@link localizerInterface} for numbers, using {@link https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/NumberFormat|Intl.NumberFormat}.
 * @param {string} defaultLocale
 * @param {string} [locale=defaultLocale] - Passed to the {@link Intl.NumberFormat|https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/NumberFormat} constructor.
 * @param {object} [options] - Passed to the `Intl.NumberFormat` constructor.
 * @param {boolean} [options.acceptStandardDigits=false] - Accept standard digits and decimal point interchangeably with localized digits and decimal point. (This option is interpreted here; it is not used by `Intl.NumberFormat`.)
 * @constructor
 * @extends Formatter
 * @tutorial localization
 */
var NumberFormatter = Formatter.extend('NumberFormatter', {
    initialize: function(defaultLocale, locale, options) {
        if (typeof locale === 'object') {
            options = locale;
        }

        options = options || {};

        this.format = new Intl.NumberFormat(this.locale, options).format;

        var mapperOptions = { useGrouping: false },
            mapper = new Intl.NumberFormat(this.locale, mapperOptions).format;

        this.demapper = demap.bind(this);

        /**
         * @summary A string containing the valid characters.
         * @desc Contains all localized digits + localized decimal point.
         * If we're accepting standard digits, will also contain all the standard digits + standard decimal point (if different than localized versions).
         * @type {string}
         * @private
         * @desc Localized digits and decimal point. Will also include standardized digits and decimal point if `options.acceptStandardDigits` is truthy.
         *
         * For internal use by the {@link NumberFormatter#parse|parse} method.
         * @memberOf NumberFormatter.prototype
         */
        this.map = mapper(10123456789.5).substr(1, 11); // localized '0123456789.'

        if (options.acceptStandardDigits && this.map !== '0123456789.') {
            this.map += '0123456789.';  // standard '0123456789.'
        }

        /** @summary A regex that tests `true` on first invalid character.
         * @type {RegExp}
         * @private
         * @desc Valid characters include:
         *
         * * Localized digits
         * * Localized decimal point
         * * Standard digits (when `options.acceptStandardDigits` is truthy)
         * * Standard decimal point (when `options.acceptStandardDigits` is truthy)
         * * Cosmetic characters added by formatter as per `options` (for human-friendly readability).
         *
         * Any characters outside this set are considered invalid.
         *
         * Set by the constructor; consumed by the {@link module:localization~NumberFormatter#invalid|invalid} method.
         *
         * Testing a string against this pattern yields `true` if at least one invalid character or `false` if all characters are valid.
         * @memberOf NumberFormatter.prototype
         */
        this.invalids = new RegExp(
            '[^' +
            this.format(11111).replace(this.map[1], '') + // thousands separator if in use
            this.map + // digits + decimal point
            ']'
        );
    },

    /** @summary Tests for invalid characters.
     * @desc Tests a localized string representation of a number that it contains any invalid characters.
     *
     * The number may be unformatted or it may be formatted with any of the permitted formatting characters, as implied by the constructor's `options` (passed to `Intl.NumberFormat`). Any other characters are considered invalid.
     *
     * However, standard digits and the standard decimal point are considered valid if the value of `options.acceptStandardDigits` as provided to the constructor was truthy. (Of course, these are always valid for locales that use them.)
     *
     * Use this method to:
     * 1. Filter out invalid characters on a `onkeydown` event; or
     * 2. Test an edited string prior to calling the {@link module:localization~NumberFormatter#parse|parse}.
     *
     * NOTE: This method does not check grammatical syntax; it only checks for invalid characters.
     *
     * @param number
     * @returns {boolean|string} Falsy means valid which in this case means contains only valid characters.
     * @memberOf NumberFormatter.prototype
     */
    invalid: function(number) {
        return this.invalids.test(number);
    },

    expectation:
        'Expected a number with optional commas (thousands grouping separator), optional decimal point, and an optional fractional part.\n' +
        'Comma separators are part of the format and will always be displayed for values >= 1000.\n' +
        'Edited values are always saved in their entirety even though the formatted value is rounded to the specified number of decimal places.',

    /**
     * This method will:
     * * Convert localized digits and decimal point characters to standard digits and decimal point characters.
     * * "Clean" the string by ignoring all other characters.
     * * Coerce the string to a number primitive.
     * @param {string} formattedLocalizedNumber - May or may not be formatted.
     * @returns {number} Number primitive.
     * @throws {string} Invalid number.
     * @memberOf NumberFormatter.prototype
     */
    parse: function(formattedLocalizedNumber) {
        var number = Number(
            formattedLocalizedNumber.split('').map(this.demapper).join('')
        );

        if (isNaN(number)) {
            throw 'Invalid Number';
        }

        return number;
    }
});

function demap(c) {
    var d = this.map.indexOf(c) % 11;
    return d < 0 ? '' : d < 10 ? d : '.';
}

/**
 * @implements localizerInterface
 * @param {string} defaultLocale
 * @param {string} [locale=defaultlocale] - Passed to the {@link Intl.DateFormat|https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/DateFormat} constructor.
 * @param {object} [options] - Passed to the `Intl.DateFormat` constructor.
 * @constructor
 * @extends Formatter
 */
var DateFormatter = Formatter.extend('DateFormatter', {
    initialize: function(defaultLocale, locale, options) {
        if (typeof locale === 'object') {
            options = locale;
        }

        options = options || {};

        /** @summary Transform a date object into human-friendly string representation.
         * @method
         */
        this.format = new Intl.DateTimeFormat(this.locale, options).format;

        // Get digits because may be chinese or "real Arabic" numerals.
        var testOptions = { useGrouping: false, style: 'decimal' },
            localizeNumber = new Intl.NumberFormat(this.locale, testOptions).format,
            localizedDigits = this.localizedDigits = localizeNumber(10123456789).substr(1, 10); // all localized digits in numerical order

        this.digitFormatter = formatDigit.bind(this);
        this.digitParser = parseDigit.bind(this);

        // Localize a test date with the default numeric parts to find out the resulting order of these parts.
        var yy = 1987,
            mm = 12,
            dd = 30,
            YY = this.transformNumber(this.digitFormatter, yy),
            MM = this.transformNumber(this.digitFormatter, mm),
            DD = this.transformNumber(this.digitFormatter, dd),
            testDate = new Date(yy, mm - 1, dd),
            localizeDate = new Intl.DateTimeFormat(this.locale).format,
            localizedDate = localizeDate(testDate), // all localized digits + localized punctuation
            missingDigits = new Intl.NumberFormat(this.locale).format(456),
            localizedNumberPattern = this.localizedNumberPattern = new RegExp('[' + localizedDigits + ']+', 'g'),
            parts = localizedDate.match(localizedNumberPattern);

        this.partsMap = {
            yy: parts.indexOf(YY),
            mm: parts.indexOf(MM),
            dd: parts.indexOf(DD)
        };

        if (options.acceptStandardDigits) {
            missingDigits += '1234567890';
        }

        /** @summary A regex that tests `true` on first invalid character.
         * @type {RegExp}
         * @private
         * @desc Valid characters include:
         *
         * * Localized digits
         * * Standard digits (when `options.acceptStandardDigits` is truthy)
         * * Localized punctuation to delimit date parts
         *
         * Any characters outside this set are considered invalid. Note that this only currently implemented when all three date parts are numeric
         *
         * Set by the constructor; consumed by the {@link NumberFormatter#valid|valid} method.
         *
         * Testing a string against this pattern yields `true` if at least one invalid character or `false` if all characters are valid.
         * @memberOf DateFormatter.prototype
         */
        this.invalids = new RegExp(
            '[^' +
            localizedDate.replace(/-/g, '\\-') +
            missingDigits +
            ']'
        );
    },

    /** @summary Tests for invalid characters.
     * @desc Tests a localized string representation of a number that it contains any invalid characters.
     *
     * The date is assumed to contain localized digits and punctuation as would be returned by `Intl.DateFormat` with the given `locale` and `options`. Any other characters are considered invalid.
     *
     * However, standard digits and the standard decimal point are also considered valid if the value of `options.acceptStandardDigits` as provided to the constructor was truthy. (Of course, these are always valid for locales that use them.)
     *
     * Use this method to:
     * 1. Filter out invalid characters on a `onkeydown` event; or
     * 2. Test an edited string prior to calling the {@link module:localization~DateFormatter#parse|parse}.
     *
     * NOTE: The current implementation only supports date formats using all numerics (which is the default for `Intl.DateFormat`).
     *
     * NOTE: This method does not check grammatical syntax; it only checks for invalid characters.
     *
     * @param number
     * @returns {boolean} Contains only valid characters.
     * @memberOf DateFormatter.prototype
     */
    invalid: function(number) {
        return this.invalids.test(number);
    },

    /**
     * This method will:
     * * Convert localized date to Date object.
     * * "Clean" the string by ignoring all other characters.
     * * Coerce the string to a number primitive.
     * @param {string} localizedDate
     * @returns {Date}
     * @throws {string} Invalid date.
     * @memberOf DateFormatter.prototype
     */
    parse: function(localizedDate) {
        var date,
            parts = localizedDate.match(this.localizedNumberPattern);

        if (parts && parts.length === 3) {
            var y = this.transformNumber(this.digitParser, parts[this.partsMap.yy]),
                m = this.transformNumber(this.digitParser, parts[this.partsMap.mm]) - 1,
                d = this.transformNumber(this.digitParser, parts[this.partsMap.dd]);

            date = new Date(y, m, d);
        } else {
            throw 'Invalid Date';
        }

        return date;
    },

    /**
     * Transform a number to or from a string representation with localized digits.
     * @param {function} digitTransformer - A function bound to `this`.
     * @param {number} number
     * @returns {string}
     * @private
     * @memberOf DateFormatter.prototype
     */
    transformNumber: function(digitTransformer, number) {
        return number.toString().split('').map(digitTransformer).join('');
    }
});

function formatDigit(d) {
    return this.localizedDigits[d];
}

function parseDigit(c) {
    var d = this.localizedDigits.indexOf(c);
    if (d < 0) { d = ''; }
    return d;
}

/**
 * All members are localizers (conform to {@link localizerInterface}) with exception of `get`, `set`, and localizer constructors which are named (by convention) ending in "Formmatter".
 *
 * The application developer is free to add localizers and localizer factory methods. See the {@link Localization#construct|construct} convenience method which may be helpful in this regard.
 * @param locale
 * @param {object} [numberOptions]
 * @param {object} [dateOptions]
 * @constructor
 */
function Localization(locale, numberOptions, dateOptions) {
    this.locale = locale;

    /**
     * @name number
     * @see The {@link NumberFormatter|NumberFormatter} class
     * @memberOf Localization.prototype
     */
    this.int = this.float = this.construct('number', NumberFormatter, numberOptions);

    /**
     * @see The {@link DateFormatter|DateFormatter} class
     * @memberOf Localization.prototype
     */
    this.construct('date', DateFormatter, dateOptions);
}

Localization.prototype = {
    constructor: Localization.prototype.constructor,
    $$CLASS_NAME: 'Localization',

    /** @summary Creates a localizer from a localizer factory object using the default locale.
     * @desc Performs the following actions:
     * 1. Binds `Constructor` to `locale`.
     * 2. Adds the newly bound constructor to this object (for future reference) with the key "NameFormatter" (where "Name" is the localizer name, all lower case but with an initial capital).
     * 3. Uses the newly bound constructor to create a new localized localizer with the provided options.
     * 4. Adds new localizer to this object via {@link Localization#add|add}.
     *
     * @param {string} localizerName
     * @param {Constructor
     * @param {object} {factoryOptions}
     * @returns {localizerInterface} The new localizer.
     */
    construct: function(localizerName, Constructor, factoryOptions) {
        var constructorName = localizerName[0].toUpperCase() + localizerName.substr(1).toLowerCase() + 'Formatter',
            BoundConstructor = Constructor.bind(null, this.locale),
            localizer = new BoundConstructor(factoryOptions);

        this[constructorName] = BoundConstructor;

        return this.add(localizerName, localizer);
    },

    /** @summary Register a localizer.
     * @desc Checks the provided localizer that it conforms to {@link localizerInterface}
     * and adds it to the object using localizerName all lower case as the key.
     * @param {string} name
     * @param {localizerInterface} localizer
     * @memberOf Localization.prototype
     * @returns {localizerInterface} The provided localizer.
     */
    add: function(name, localizer) {
        if (typeof name === 'object') {
            localizer = name;
            name = undefined;
        }

        if (
            typeof localizer !== 'object' ||
            typeof localizer.format !== 'function' ||
            typeof localizer.parse !== 'function' ||
            localizer.invalid && typeof localizer.invalid !== 'function' ||
            localizer.expectation && typeof localizer.expectation !== 'string'
        ) {
            throw 'Expected localizer object to conform to interface.';
        }

        name = name || localizer.name;
        name = name && name.toLowerCase();
        this[name] = localizer;

        return localizer;
    },

    /**
     *
     * @param localizerName
     * @returns {localizerInterface}
     * @memberOf Localization.prototype
     */
    get: function(name) {
        return this[name && name.toLowerCase()] || this.string;
    },

    ///  ///  ///  ///  ///    LOCALIZERS    ///  ///  ///  ///  ///

    // Special localizer for use by Chrome's date input control.
    chromeDate: {
        format: function(date) {
            if (date != null) {
                if (typeof date !== 'object') {
                    date = new Date(date);
                }

                var yy = date.getFullYear(),
                    m = date.getMonth() + 1, mm = m < 10 ? '0' + m : m,
                    d = date.getDate(), dd = d < 10 ? '0' + d : d;

                date = yy + '-' + mm + '-' + dd;
            } else {
                date = null;
            }
            return date;
        },
        parse: function(str) {
            var date,
                parts = str.split('-');
            if (parts && parts.length === 3) {
                date = new Date(parts[0], parts[1] - 1, parts[2]);
            } else {
                date = null;
            }
            return date;
        }
    },

    null: {
        format: function(value) {
            return value;
        },
        parse: function(str) {
            return str;
        }
    },

    string: {
        format: function(value) {
            return value + '';
        },
        parse: function(str) {
            return str + '';
        }
    }
};

module.exports = Localization;

},{"../Base":25}],80:[function(require,module,exports){
'use strict';

var Base = require('../Base');

/**
 * @class
 * @param {object} [options] - The following options can alternatively be set in the prototype of an extending class.
 * @param {boolean} [options.singletons=false] - The registry will consist of singletons which will be instantiated as they are added.
 * (Otherwise the registry consists of constructors which are instantiated later on as needed.)
 * @param {boolean} [options.private=false] - This instance will use a private registry.
 */
var Registry = Base.extend('Registry', {
    initialize: function(options) {
        this.options = options;

        if (this.option('private')) {
            this.items = Object.create(this.items);
        }
    },

    option: function(key) {
        return this.options && key in this.options ? this.options[key] : this[key];
    },

    /**
     * @summary Register and instantiate a singleton.
     * @desc Adds an item to the registry using the provided name (or the class name), converted to all lower case.
     * @param {string} [name] - Case-insensitive item key. If not given, `Constructor.prototype.$$CLASS_NAME` is used.
     * @param {function} Constructor
     *
     * > Note: `$$CLASS_NAME` is normally set by providing a string as the (optional) first parameter (`alias`) in your {@link https://www.npmjs.com/package/extend-me|extend} call.
     *
     * @returns {function|Constructor} A newly registered item, either `Constructor` or singleton created by `new Constructor`.
     *
     * @memberOf Registry#
     */
    add: function(name, Constructor) {
        if (typeof name === 'function') {
            Constructor = name;
            name = undefined;
        }

        name = name || Constructor.prototype.$$CLASS_NAME || Constructor.name; // try Funciton.prototype.name as last resort

        if (!name) {
            throw new this.HypergridError('Expected a registration name.');
        }

        name = name.toLowerCase();

        return (this.items[name] = this.option('singletons') ? this.construct(Constructor) : Constructor);
    },

    /**
     * @summary Register a synonym for an existing item.
     * @param {string} synonymName
     * @param {string} existingName
     * @returns {function|Constructor} The previously registered item this new synonym points to.
     * @memberOf Registry#
     */
    addSynonym: function(synonymName, existingName) {
        return (this.items[synonymName] = this.get(existingName));
    },

    /**
     * Fetch a registered singleton.
     * @param {string} [name]
     * @param {boolean} [noThrow] - Avoid throwing error if no such item; just return `undefined`.
     * @returns {function|Constructor|undefined} A registered constructor item or `undefined` if none such.
     * @memberOf Registry#
     */
    get: function(name, noThrow) {
        if (!name) {
            return;
        }

        var result = this.items[name]; // for performance reasons, do not convert to lower case

        if (!result) {
            var lowerName = name.toLowerCase();
            result = this.items[lowerName]; // name may differ in case only
            if (result) {
                this.addSynonym(name, lowerName); // register found name as a synonym for faster access next time around to avoid converting to lower case again
            }
        }

        if (!noThrow && !result) {
            var classDesc = this.$$CLASS_NAME.replace(/[A-Z]/g, ' $1').trim().toLowerCase();
            throw new this.HypergridError('Expected "' + name + '" to be a registered ' + classDesc + '.');
        }

        return result;
    },

    /**
     * @summary Lookup registered item and return a new instance thereof.
     * @returns New instance of the named constructor or `undefined` if none such.
     * @param {string} name - Name of a registered item.
     * @param {string} [options] - Properties to add to the instantiated item primarily for `mustache` use.
     * @memberOf Registry#
     */
    create: function(name, options) {
        var Constructor = this.get(name);

        if (typeof Constructor !== 'function') {
            return;
        }

        if (Constructor.abstract) {
            throw new this.HypergridError('Attempt to instantiate the abstract "' + name + '" class.');
        }

        return this.construct(Constructor, options);
    },

    construct: function(Constructor, options) {
        return new Constructor(Object.assign({}, this.options, options));
    }
});


module.exports = Registry;

},{"../Base":25}],81:[function(require,module,exports){
'use strict';

var RangeSelectionModel = require('sparse-boolean-array');

/**
 *
 * @constructor
 * @desc We represent selections as a list of rectangles because large areas can be represented and tested against quickly with a minimal amount of memory usage. Also we need to maintain the selection rectangles flattened counter parts so we can test for single dimension contains. This is how we know to highlight the fixed regions on the edges of the grid.
 */

function SelectionModel(grid) {
    this.grid = grid;
    this.reset();
}

SelectionModel.prototype = {

    constructor: SelectionModel.prototype.constructor,

    /**
     * @type {boolean}
     * @memberOf SelectionModel.prototype
     */
    allRowsSelected: false,

    reset: function() {
        /**
         * @name selections
         * @type {Rectangle[]}
         * @summary The selection rectangles.
         * @desc Created as an empty array upon instantiation by the {@link SelectionModel|constructor}.
         * @memberOf SelectionModel.prototype
         */
        this.selections = [];

        /**
         * @name flattenedX
         * @type {Rectangle[]}
         * @summary The selection rectangles flattened in the horizontal direction (no width).
         * @desc Created as an empty array upon instantiation by the {@link SelectionModel|constructor}.
         * @memberOf SelectionModel.prototype
         */
        this.flattenedX = [];

        /**
         * @name flattenedY
         * @type {Rectangle[]}
         * @summary The selection rectangles flattened in the vertical direction (no height).
         * @desc Created as an empty array upon instantiation by the {@link SelectionModel|constructor}.
         * @memberOf SelectionModel.prototype
         */
        this.flattenedY = [];

        /**
         * @name rowSelectionModel
         * @type {RangeSelectionModel}
         * @summary The selection rectangles.
         * @desc Created as a new RangeSelectionModel upon instantiation by the {@link SelectionModel|constructor}.
         * @memberOf SelectionModel.prototype
         */
        this.rowSelectionModel = new RangeSelectionModel();

        /**
         * @name columnSelectionModel
         * @type {RangeSelectionModel}
         * @summary The selection rectangles.
         * @desc Created as a new RangeSelectionModel upon instantiation by the {@link SelectionModel|constructor}.
         * @memberOf SelectionModel.prototype
         */
        this.columnSelectionModel = new RangeSelectionModel();

        this.setLastSelectionType('');
    },

    /**
     * @memberOf SelectionModel.prototype
     * @returns {*}
     */
    getLastSelection: function() {
        var sels = this.selections;
        var sel = sels[sels.length - 1];
        return sel;
    },

    /**
     * @memberOf SelectionModel.prototype
     * @returns {*}
     */
    getLastSelectionType: function() {
        return this.lastSelectionType;
    },

    /**
     * @param type
     * @memberOf SelectionModel.prototype
     */
    setLastSelectionType: function(type) {
        this.lastSelectionType = type;
    },

    /**
     * @memberOf SelectionModel.prototype
     * @description Select the region described by the given coordinates.
     *
     * @param {number} ox - origin x coordinate
     * @param {number} oy - origin y coordinate
     * @param {number} ex - extent x coordinate
     * @param {number} ey - extent y coordinate
     * @param {boolean} silent - whether to fire selection changed event
     */
    select: function(ox, oy, ex, ey, silent) {
        var newSelection = this.grid.newRectangle(ox, oy, ex, ey);

        //Cache the first selected cell before it gets normalized to top-left origin
        newSelection.firstSelectedCell = this.grid.newPoint(ox, oy);

        newSelection.lastSelectedCell = (
            newSelection.firstSelectedCell.x === newSelection.origin.x &&
            newSelection.firstSelectedCell.y === newSelection.origin.y
        )
            ? newSelection.corner
            : newSelection.origin;

        if (this.grid.properties.multipleSelections) {
            this.selections.push(newSelection);
            this.flattenedX.push(newSelection.flattenXAt(0));
            this.flattenedY.push(newSelection.flattenYAt(0));
        } else {
            this.selections[0] = newSelection;
            this.flattenedX[0] = newSelection.flattenXAt(0);
            this.flattenedY[0] = newSelection.flattenYAt(0);
        }
        this.setLastSelectionType('cell');

        if (!silent) {
            this.grid.selectionChanged();
        }
    },

    /**
     * @memberOf SelectionModel.prototype
     * @param {number} ox - origin x coordinate
     * @param {number} oy - origin y coordinate
     * @param {number} ex - extent x coordinate
     * @param {number} ey - extent y coordinate
     */
    toggleSelect: function(ox, oy, ex, ey) {

        var selected, index;

        selected = this.selections.find(function(selection, idx) {
            index = idx;
            return (
                selection.origin.x === ox && selection.origin.y === oy &&
                selection.extent.x === ex && selection.extent.y === ey
            );
        });

        if (selected) {
            this.selections.splice(index, 1);
            this.flattenedX.splice(index, 1);
            this.flattenedY.splice(index, 1);
            this.grid.selectionChanged();
        } else {
            this.select(ox, oy, ex, ey);
        }
    },

    /**
     * @memberOf SelectionModel.prototype
     * @desc Remove the last selection that was created.
     */
    clearMostRecentSelection: function(keepRowSelections) {
        if (!keepRowSelections) {
            this.setAllRowsSelected(false);
        }
        if (this.selections.length) { --this.selections.length; }
        if (this.flattenedX.length) { --this.flattenedX.length; }
        if (this.flattenedY.length) { --this.flattenedY.length; }
        //this.getGrid().selectionChanged();
    },

    /**
     * @memberOf SelectionModel.prototype
     */
    clearMostRecentColumnSelection: function() {
        this.columnSelectionModel.clearMostRecentSelection();
        this.setLastSelectionType('column');
    },

    /**
     * @memberOf SelectionModel.prototype
     */
    clearMostRecentRowSelection: function() {
        this.rowSelectionModel.clearMostRecentSelection();
        this.setLastSelectionType('row');
    },

    /**
     * @memberOf SelectionModel.prototype
     */
    clearRowSelection: function() {
        this.rowSelectionModel.clear();
        this.setLastSelectionType('row');
    },

    /**
     * @memberOf SelectionModel.prototype
     * @returns {*}
     */
    getSelections: function() {
        return this.selections;
    },

    /**
     * @memberOf SelectionModel.prototype
     * @returns {boolean} There are active selection(s).
     */
    hasSelections: function() {
        return this.selections.length !== 0;
    },

    /**
     * @memberOf SelectionModel.prototype
     * @returns {boolean}
     */
    hasRowSelections: function() {
        return !this.rowSelectionModel.isEmpty();
    },

    /**
     * @memberOf SelectionModel.prototype
     * @returns {boolean}
     */
    hasColumnSelections: function() {
        return !this.columnSelectionModel.isEmpty();
    },

    /**
     * @memberOf SelectionModel.prototype
     * @return {boolean} Selection covers a specific column.
     * @param {number} y
     */
    isCellSelectedInRow: function(y) {
        return this._isCellSelected(this.flattenedX, 0, y);
    },

    /**
     * @memberOf SelectionModel.prototype
     * @returns Selection covers a specific row.
     * @param {number} x
     */
    isCellSelectedInColumn: function(x) {
        return this._isCellSelected(this.flattenedY, x, 0);
    },

    /**
     * @memberOf SelectionModel.prototype
     * @summary Selection query function.
     * @returns {boolean} The given cell is selected (part of an active selection).
     * @param {Rectangle[]} selections - Selection rectangles to search through.
     * @param {number} x
     * @param {number} y
     */
    isSelected: function(x, y) {
        return (
            this.isColumnSelected(x) ||
            this.isRowSelected(y) ||
            this._isCellSelected(this.selections, x, y)
        );
    },

    /**
     * @memberOf SelectionModel.prototype
     * @param x
     * @param y
     * @returns {*}
     */
    isCellSelected: function(x, y) {
        return this._isCellSelected(this.selections, x, y);
    },

    /**
     * @memberOf SelectionModel.prototype
     * @param selections
     * @param x
     * @param y
     * @returns {boolean}
     * @private
     */
    _isCellSelected: function(selections, x, y) {
        var self = this;
        return !!selections.find(function(selection) {
            return self.rectangleContains(selection, x, y);
        });
    },

    /**
     * @memberOf SelectionModel.prototype
     * @desc empty out all our state
     *
     */
    clear: function(keepRowSelections) {
        this.selections.length = 0;
        this.flattenedX.length = 0;
        this.flattenedY.length = 0;
        this.columnSelectionModel.clear();
        if (!keepRowSelections) {
            this.setAllRowsSelected(false);
            this.rowSelectionModel.clear();
        }
        //this.getGrid().selectionChanged();
    },

    /**
     * @memberOf SelectionModel.prototype
     * @param {number} ox - origin x coordinate
     * @param {number} oy - origin y coordinate
     * @param {number} ex - extent x coordinate
     * @param {number} ey - extent y coordinate
     * @returns {boolean}
     */
    isRectangleSelected: function(ox, oy, ex, ey) {
        return !!this.selections.find(function(selection) {
            return (
                selection.origin.x === ox && selection.origin.y === oy &&
                selection.extent.x === ex && selection.extent.y === ey
            );
        });
    },

    /**
     * @memberOf SelectionModel.prototype
     * @param x
     * @returns {*}
     */
    isColumnSelected: function(x) {
        return this.columnSelectionModel.isSelected(x);
    },

    /**
     * @memberOf SelectionModel.prototype
     * @param y
     * @returns {boolean|*}
     */
    isRowSelected: function(y) {
        return this.allRowsSelected || this.rowSelectionModel.isSelected(y);
    },

    /**
     * @memberOf SelectionModel.prototype
     * @param x1
     * @param x2
     */
    selectColumn: function(x1, x2) {
        this.columnSelectionModel.select(x1, x2);
        this.setLastSelectionType('column');
    },

    /**
     * @memberOf SelectionModel.prototype
     */
    selectAllRows: function() {
        this.clear();
        this.setAllRowsSelected(true);
    },

    /**
     * @memberOf SelectionModel.prototype
     * @returns {boolean}
     */

    setAllRowsSelected: function(isIt) {
        this.allRowsSelected = isIt;
    },

    areAllRowsSelected: function() {
        return this.allRowsSelected;
    },

    /**
     * @memberOf SelectionModel.prototype
     * @param y1
     * @param y2
     */
    selectRow: function(y1, y2) {
        this.rowSelectionModel.select(y1, y2);
        this.setLastSelectionType('row');
    },

    /**
     * @memberOf SelectionModel.prototype
     * @param x1
     * @param x2
     */
    deselectColumn: function(x1, x2) {
        this.columnSelectionModel.deselect(x1, x2);
        this.setLastSelectionType('column');
    },

    /**
     * @memberOf SelectionModel.prototype
     * @param y1
     * @param y2
     */
    deselectRow: function(y1, y2) {
        if (this.areAllRowsSelected()) {
            // To deselect a row, we must first remove the all rows flag...
            this.setAllRowsSelected(false);
            // ...and create a single range representing all rows
            this.rowSelectionModel.select(0, this.grid.getRowCount() - 1);
        }
        this.rowSelectionModel.deselect(y1, y2);
        this.setLastSelectionType('row');
    },

    /**
     * @memberOf SelectionModel.prototype
     * @returns {*}
     */
    getSelectedRows: function() {
        if (this.areAllRowsSelected()) {
            var headerRows = this.grid.getHeaderRowCount();
            var rowCount = this.grid.getRowCount() - headerRows;
            var result = new Array(rowCount);
            for (var i = 0; i < rowCount; i++) {
                result[i] = i + headerRows;
            }
            return result;
        }
        return this.rowSelectionModel.getSelections();
    },

    /**
     * @memberOf SelectionModel.prototype
     * @returns {*|Array.Array.number}
     */
    getSelectedColumns: function() {
        return this.columnSelectionModel.getSelections();
    },

    /**
     * @memberOf SelectionModel.prototype
     * @returns {boolean}
     */
     isColumnOrRowSelected: function() {
        return !this.columnSelectionModel.isEmpty() || !this.rowSelectionModel.isEmpty();
    },

    /**
     * @memberOf SelectionModel.prototype
     * @returns {Array}
     */
    getFlattenedYs: function() {
        var result = [];
        var set = {};
        this.selections.forEach(function(selection) {
            var top = selection.origin.y;
            var size = selection.extent.y + 1;
            for (var r = 0; r < size; r++) {
                var ti = r + top;
                if (!set[ti]) {
                    result.push(ti);
                    set[ti] = true;
                }
            }
        });
        result.sort(function(x, y) {
            return x - y;
        });
        return result;
    },

    /**
     * @memberOf SelectionModel.prototype
     * @param offset
     */
    selectRowsFromCells: function(offset, keepRowSelections) {
        offset = offset || 0;

        var sm = this.rowSelectionModel;

        if (!keepRowSelections) {
            this.setAllRowsSelected(false);
            sm.clear();
        }

        this.selections.forEach(function(selection) {
            var top = selection.origin.y,
                extent = selection.extent.y;
            top += offset;
            sm.select(top, top + extent);
        });
    },

    /**
     * @memberOf SelectionModel.prototype
     * @param offset
     */
    selectColumnsFromCells: function(offset) {
        offset = offset || 0;

        var sm = this.columnSelectionModel;
        sm.clear();

        this.selections.forEach(function(selection) {
            var left = selection.origin.x,
                extent = selection.extent.x;
            left += offset;
            sm.select(left, left + extent);
        });
    },

    /**
     * @memberOf SelectionModel.prototype
     * @param x
     * @param y
     * @returns {*}
     */
    isInCurrentSelectionRectangle: function(x, y) {
        var last = this.selections[this.selections.length - 1];
        return last && this.rectangleContains(last, x, y);
    },

    /**
     * @memberOf SelectionModel.prototype
     * @param rect
     * @param x
     * @param y
     * @returns {boolean}
     */
    rectangleContains: function(rect, x, y) { //TODO: explore why this works and contains on rectanglular does not
        var minX = rect.origin.x;
        var minY = rect.origin.y;
        var maxX = minX + rect.extent.x;
        var maxY = minY + rect.extent.y;

        if (rect.extent.x < 0) {
            minX = maxX;
            maxX = rect.origin.x;
        }

        if (rect.extent.y < 0) {
            minY = maxY;
            maxY = rect.origin.y;
        }

        var result =
            x >= minX &&
            y >= minY &&
            x <= maxX &&
            y <= maxY;

        return result;
    }
};

module.exports = SelectionModel;

},{"sparse-boolean-array":23}],82:[function(require,module,exports){
'use strict';

var Point = require('rectangular').Point;

/**
 * Variation of `rectangular.Point` but with writable `x` and `y`
 * @constructor
 */
function WritablePoint(x, y) {
    // skip x and y initialization here for performance
    // because typically reset after instantiation
}

WritablePoint.prototype = Point.prototype;

module.exports = WritablePoint;

},{"rectangular":22}],83:[function(require,module,exports){
'use strict';

var WritablePoint = require('./WritablePoint');

var writableDescriptor = { writable: true };
var eumerableDescriptor = { writable: true, enumerable: true };

// The nullSubgrid is for CellEvents representing clicks below last row.
// var nullSubgrid = {};

factory.cellEventProperties = Object.defineProperties({}, {
    /**
     * The raw value of the cell, unformatted.
     * @memberOf CellEvent#
     */
    value: {
        get: function() { return this.subgrid.getValue(this.dataCell.x, this.dataCell.y); },
        set: function(value) { this.subgrid.setValue(this.dataCell.x, this.dataCell.y, value); }
    },

    /**
     * An object representing the whole data row, including hidden columns.
     * @type {object}
     * @memberOf CellEvent#
     */
    dataRow: {
        get: function() { return this.subgrid.getRow(this.dataCell.y); }
    },

    /**
     * The formatted value of the cell.
     * @memberOf CellEvent#
     */
    formattedValue: {
        get: function() { return this.grid.formatValue(this.properties.format, this.value); }
    },

    /**
     * The bounds of the cell.
     * @property {number} left
     * @property {number} top
     * @property {number} width
     * @property {number} height
     * @memberOf CellEvent#
     */
    bounds: { get: function() {
        return this._bounds || (this._bounds = {
            x: this.visibleColumn.left,
            y: this.visibleRow.top,
            width: this.visibleColumn.width,
            height: this.visibleRow.height
        });
    } },

    columnProperties: { get: function() {
        var cp = this._columnProperties;
        if (!cp) {
            cp = this.column.properties;
            if (this.isHandleColumn){
                cp = cp.rowHeader;
            } else if (this.isTreeColumn) {
                cp = cp.treeHeader;
            } else if (this.isDataRow) {
                // cp already set to basic props
            } else if (this.isFilterRow) {
                cp = cp.filterProperties;
            } else { // unselected header, summary, etc., all have save look as unselected header
                cp = cp.columnHeader;
            }
            this._columnProperties = cp;
        }
        return cp;
    } },
    cellOwnProperties: { get: function() {
        // do not use for get/set prop because may return null; instead use .getCellProperty('prop') or .properties.prop (preferred) to get, setCellProperty('prop', value) to set
        if (this._cellOwnProperties === undefined) {
            this._cellOwnProperties = this.column.getCellOwnProperties(this.dataCell.y, this.subgrid);
        }
        return this._cellOwnProperties; // null return means there is no cell properties object
    } },
    /**
     * @returns {string} Cell properties object if it exists, else the column properties object it would have as a prototype if did exist.
     * @method
     * @memberOf CellEvent#
     */
    properties: { get: function() {
        return this.cellOwnProperties || this.columnProperties;
    } },
    /**
     * @param {string} key - Property name.
     * @returns {string} Property value.
     * @method
     * @memberOf CellEvent#
     */
    getCellProperty: { value: function(key) {
        // included for completeness but `.properties[key]` is preferred
        return this.properties[key];
    } },
    /**
     * @param {string} key - Property name.
     * @param {string} value - Property value.
     * @method
     * @memberOf CellEvent#
     */
    setCellProperty: { value: function(key, value) {
        // do not use `.cellOwnProperties[key] = value` because object may be null (this method creates new object as needed)
        this._cellOwnProperties = this.column.setCellProperty(this.dataCell.y, key, value, this.subgrid);
    } },

    rowOwnProperties: {
        // undefined return means there is no row properties object
        get: function() {
            return this.behavior.getRowProperties(this);
        }
    },
    rowProperties: {
        get: function() {
            // use carefully! creates new object as needed; only use when object definitely needed: for setting prop with `.rowProperties[key] = value` or `Object.assign(.rowProperties, {...})`; use getRowProperty(key) instead for getting a property that may not exist because it will not create a new object
            return this.behavior.getRowProperties(this, {});
        },
        set: function(properties) {
            // for resetting whole row properties object: `.rowProperties = {...}`
            this.behavior.setRowProperties(this, properties); // calls `stateChanged()`
        }
    },
    getRowProperty: { value: function(key) {
        // undefined return means there is no row properties object OR no such row property `[key]`
        var rowProps = this.rowOwnProperties;
        return rowProps && rowProps[key];
    } },
    setRowProperty: { value: function(key, value) {
        // creates new object as needed
        this.rowProperties[key] = value; // todo: call `stateChanged()` after refac-as-flags
    } },

    // special method for use by renderer which reuses cellEvent object for performance reasons
    reset: { value: function(visibleColumn, visibleRow) {
        // getter caches
        this._columnProperties = undefined;
        this._cellOwnProperties = undefined;
        this._bounds = undefined;

        // partial render support
        this.snapshot = undefined;
        this.minWidth = undefined;
        this.disabled = undefined;

        this.visibleColumn = visibleColumn;
        this.visibleRow = visibleRow;

        this.subgrid = visibleRow.subgrid;

        this.column = visibleColumn.column; // enumerable so will be copied to cell renderer object

        this.gridCell.x = visibleColumn.columnIndex;
        this.gridCell.y = visibleRow.index;

        this.dataCell.x = this.column && this.column.index;
        this.dataCell.y = visibleRow.rowIndex;
    } },

    /**
     * Set up this `CellEvent` instance to point to the cell at the given grid coordinates.
     * @desc If the requested cell is not be visible (due to being scrolled out of view or outside the bounds of the rendered grid), the instance is not reset.
     * @param {number} gridC - Horizontal grid cell coordinate adjusted for horizontal scrolling after fixed columns.
     * @param {number} gridY - Raw vertical grid cell coordinate.
     * @returns {boolean} Visibility.
     * @method
     * @memberOf CellEvent#
     */
    resetGridCY: { value: function(gridC, gridY) {
        var vr, vc, visible = (
            (vc = this.renderer.getVisibleColumn(gridC)) &&
            (vr = this.renderer.getVisibleRow(gridY))
        );
        if (visible) { this.reset(vc, vr); }
        return visible;
    } },

    /**
     * Set up this `CellEvent` instance to point to the cell at the given grid coordinates.
     * @desc If the requested cell is not be visible (due to being scrolled out of view or outside the bounds of the rendered grid), the instance is not reset.
     * @param {number} gridX - Raw horizontal grid cell coordinate.
     * @param {number} gridY - Raw vertical grid cell coordinate.
     * @returns {boolean} Visibility.
     * @method
     * @memberOf CellEvent#
     */
    resetGridXY: { value: function(gridX, gridY) {
        var vr, vc, visible = (
            (vc = this.renderer.visibleColumns[gridX]) &&
            (vr = this.renderer.getVisibleRow(gridY))
        );
        if (visible) { this.reset(vc, vr); }
        return visible;
    } },

    /**
     * @summary Set up this `CellEvent` instance to point to the cell at the given data coordinates.
     * @desc If the requested cell is not be visible (due to being scrolled out of view), the instance is not reset.
     * @param {number} dataX - Horizontal data cell coordinate.
     * @param {number} dataY - Vertical data cell coordinate.
     * @param {dataModelAPI} [subgrid=this.behavior.subgrids.data]
     * @returns {boolean} Visibility.
     * @method
     * @memberOf CellEvent#
     */
    resetDataXY: { value: function(dataX, dataY, subgrid) {
        var vr, vc, visible = (
            (vc = this.renderer.getVisibleDataColumn(dataX)) &&
            (vr = this.renderer.getVisibleDataRow(dataY, subgrid))
        );
        if (visible) { this.reset(vc, vr); }
        return visible;
    } },

    /**
     * Set up this `CellEvent` instance to point to the cell at the given grid column and data row coordinates.
     * @desc If the requested cell is not be visible (due to being scrolled out of view or outside the bounds of the rendered grid), the instance is not reset.
     * @param {number} gridX - Horizontal grid cell coordinate (adjusted for horizontal scrolling after fixed columns).
     * @param {number} dataY - Vertical data cell coordinate.
     * @param {dataModelAPI} [subgrid=this.behavior.subgrids.data]
     * @param {boolean} [useAllCells] - Search in all rows and columns instead of only rendered ones.
     * @returns {boolean} Visibility.
     * @method
     * @memberOf CellEvent#
     */
    resetGridXDataY: { value: function(gridX, dataY, subgrid, useAllCells) {
        var visible, vc, vr;

        if (useAllCells) {
            // When expanding selections larger than the viewport, the origin/corner
            // points may not be rendered and would normally fail to reset cell's position.
            // Mock column and row objects for this.reset() to use:
            vc = {
                column: this.behavior.getColumn(gridX),
                columnIndex: gridX
            };
            vr = {
                subgrid: subgrid || this.behavior.subgrids.lookup.data,
                rowIndex: dataY
            };
            visible = true;
        } else {
            visible = (
                (vc = this.renderer.getVisibleColumn(gridX)) &&
                (vr = this.renderer.getVisibleDataRow(dataY, subgrid))
            );
        }

        if (visible) {
            this.reset(vc, vr);
        }

        return visible && this;
    } },

    /**
     * Copy self with or without own properties
     * @param {boolan} [assign=false] - Copy the own properties to the clone.
     * @returns {CellEvent}
     * @method
     * @memberOf CellEvent#
     */
    clone: { value: function(assign) {
        var cellEvent = new this.constructor;

        cellEvent.resetGridXY(this.visibleColumn.index, this.visibleRow.index);

        if (assign) {
            // copy own props
            Object.assign(cellEvent, this);
        }

        return cellEvent;
    } },

    editPoint: {
        get: function() {
            throw 'The `.editPoint` property is no longer available as of v1.2.10. Use the following coordinates instead:\n' +
            '`.gridCell.x` - The active column index. (Adjusted for column scrolling after fixed columns.)\n' +
            '`.gridCell.y` - The vertical grid coordinate. (Unaffected by row scrolling.)\n' +
            '`.dataCell.x` - The data model\'s column index. (Unaffected by column scrolling.)\n' +
            '`.dataCell.y` - The data model\'s row index. (Adjusted for data row scrolling after fixed rows.)\n';
        }
    },

    /** "Visible" means scrolled into view.
     * @type {boolean}
     * @memberOf CellEvent#
     */
    isRowVisible:    { get: function() { return !!this.visibleRow; } },
    /** "Visible" means scrolled into view.
     * @type {boolean}
     * @memberOf CellEvent#
     */
    isColumnVisible: { get: function() { return !!this.visibleColumn; } },
    /** "Visible" means scrolled into view.
     * @type {boolean}
     * @memberOf CellEvent#
     */
    isCellVisible:   { get: function() { return this.isRowVisible && this.isColumnVisible; } },


    /** A data row is any row in the data subgrid; all other rows (headers, footers, _etc._) are not data rows.
     * @type {boolean}
     * @memberOf CellEvent#
     */
    isDataRow:    { get: function() { return this.subgrid.isData; } },
    /** A data column is any column that is not the row number column or the tree column.
     * @type {boolean}
     * @memberOf CellEvent#
     */
    isDataColumn: { get: function() { return this.gridCell.x >= 0; } },
    /** A data cell is a cell in both a data row and a data column.
     * @type {boolean}
     * @memberOf CellEvent#
     */
    isDataCell:   { get: function() { return this.isDataRow && this.isDataColumn; } },


    /** @type {boolean}
     * @memberOf CellEvent#
     */
    isRowSelected:    { get: function() { return this.isDataRow && this.selectionModel.isRowSelected(this.dataCell.y); } },
    /** @type {boolean}
     * @memberOf CellEvent#
     */
    isColumnSelected: { get: function() { return this.isDataColumn && this.selectionModel.isColumnSelected(this.gridCell.x); } },
    /** @type {boolean}
     * @memberOf CellEvent#
     */
    isCellSelected:   { get: function() { return this.selectionModel.isCellSelected(this.gridCell.x, this.dataCell.y); } },


    /** @type {boolean}
     * @memberOf CellEvent#
     */
    isRowHovered:    { get: function() { return this.grid.canvas.hasMouse && this.isDataRow && this.grid.hoverCell && this.grid.hoverCell.y === this.gridCell.y; } },
    /** @type {boolean}
     * @memberOf CellEvent#
     */
    isColumnHovered: { get: function() { return this.grid.canvas.hasMouse && this.isDataColumn && this.grid.hoverCell && this.grid.hoverCell.x === this.gridCell.x; } },
    /** @type {boolean}
     * @memberOf CellEvent#
     */
    isCellHovered:   { get: function() { return this.isRowHovered && this.isColumnHovered; } },


    /** @type {boolean}
     * @memberOf CellEvent#
     */
    isRowFixed:    { get: function() { return this.isDataRow && this.dataCell.y < this.grid.properties.fixedRowCount; } },
    /** @type {boolean}
     * @memberOf CellEvent#
     */
    isColumnFixed: { get: function() { return this.isDataColumn && this.gridCell.x < this.grid.properties.fixedColumnCount; } },
    /** @type {boolean}
     * @memberOf CellEvent#
     */
    isCellFixed:   { get: function() { return this.isRowFixed && this.isColumnFixed; } },


    /** @type {boolean}
     * @memberOf CellEvent#
     */
    isHandleColumn: { get: function() { return this.gridCell.x === this.behavior.rowColumnIndex && this.grid.properties.showRowNumbers; } },
    /** @type {boolean}
     * @memberOf CellEvent#
     */
    isHandleCell:   { get: function() { return this.isHandleColumn && this.isDataRow; } },


    /** @type {boolean}
     * @memberOf CellEvent#
     */
    isTreeColumn: { get: function() { return this.gridCell.x === this.behavior.treeColumnIndex; } },


    /** @type {boolean}
     * @memberOf CellEvent#
     */
    isHeaderRow:    { get: function() { return this.subgrid.isHeader; } },
    /** @type {boolean}
     * @memberOf CellEvent#
     */
    isHeaderHandle: { get: function() { return this.isHeaderRow && this.isHandleColumn; } },
    /** @type {boolean}
     * @memberOf CellEvent#
     */
    isHeaderCell:   { get: function() { return this.isHeaderRow && this.isDataColumn; } },


    /** @type {boolean}
     * @memberOf CellEvent#
     */
    isFilterRow:    { get: function() { return this.subgrid.isFilter; } },
    /** @type {boolean}
     * @memberOf CellEvent#
     */
    isFilterHandle: { get: function() { return this.isFilterRow && this.isHandleColumn; } },
    /** @type {boolean}
     * @memberOf CellEvent#
     */
    isFilterCell:   { get: function() { return this.isFilterRow && this.isDataColumn; } },


    /** @type {boolean}
     * @memberOf CellEvent#
     */
    isSummaryRow:    { get: function() { return this.subgrid.isSummary; } },
    /** @type {boolean}
     * @memberOf CellEvent#
     */
    isSummaryHandle: { get: function() { return this.isSummaryRow && this.isHandleColumn; } },
    /** @type {boolean}
     * @memberOf CellEvent#
     */
    isSummaryCell:   { get: function() { return this.isSummaryRow && this.isDataColumn; } },


    /** @type {boolean}
     * @memberOf CellEvent#
     */
    isTopTotalsRow:    { get: function() { return this.subgrid === this.behavior.subgrids.lookup.topTotals; } },
    /** @type {boolean}
     * @memberOf CellEvent#
     */
    isTopTotalsHandle: { get: function() { return this.isTopTotalsRow && this.isHandleColumn; } },
    /** @type {boolean}
     * @memberOf CellEvent#
     */
    isTopTotalsCell:   { get: function() { return this.isTopTotalsRow && this.isDataColumn; } },


    /** @type {boolean}
     * @memberOf CellEvent#
     */
    isBottomTotalsRow:    { get: function() { return this.subgrid === this.behavior.subgrids.lookup.bottomTotals; } },
    /** @type {boolean}
     * @memberOf CellEvent#
     */
    isBottomTotalsHandle: { get: function() { return this.isBottomTotalsRow && this.isHandleColumn; } },
    /** @type {boolean}
     * @memberOf CellEvent#
     */
    isBottomTotalsCell:   { get: function() { return this.isBottomTotalsRow && this.isDataColumn; } },

    $$CLASS_NAME: { value: 'CellEvent' }
});

/**
 * @name cellEventFactory
 *
 * @summary Create a custom `CellEvent` class.
 *
 * @desc Create a custom definition of `CellEvent` for each grid instance, setting the `grid`, `behavior`, and `dataModel` properties on the prototype. As this happens once per grid instantiation, it avoids having to perform this set up work on every `CellEvent` instantiation.
 *
 * @param {HyperGrid} grid
 *
 * @returns {function}
 */
function factory(grid) {

    /**
     * @summary Create a new CellEvent object.
     *
     * @classdesc `CellEvent` is a very low-level object that needs to be super-efficient. JavaScript objects are well known to be light weight in general, but at this level we need to be careful.
     *
     * These objects were originally only being created on mouse events. This was no big deal as mouse events are few and far between. However, as of v1.2.0, the renderer now also creates one for each visible cell on each and every grid paint.
     *
     * For this reason, to maintain performance, each grid gets a custom definition of `CellEvent`, created by this class factory, with the following optimizations:
     *
     * * Use of `extend-me` is avoided because its `initialize` chain is a bit too heavy here.
     * * Custom versions of `CellEvent` for each grid lightens the load on the constructor.
     *
     * @desc All own enumerable properties are mixed into cell editor:
     * * Includes `this.column` defined by constructor (as enumerable).
     * * Excludes `this.gridCell`, `this.dataCell`, `this.visibleRow.subgrid` defined by constructor (as non-enumerable).
     * * Any additional (enumerable) members mixed in by application's `getCellEditorAt` override.
     *
     * Including the params calls {@link CellEvent#resetGridCY resetGridCY(gridX, gridY)}.
     * Alternatively, instantiate without params and/or later call one of these:
     * * {@link CellEvent#resetGridXY resetGridXY(...)}
     * * {@link CellEvent#resetDataXY resetDataXY(...)}
     * * {@link CellEvent#resetGridXDataY resetGridXDataY(...)}
     *
     * @param {number} [gridX] - grid cell coordinate (adjusted for horizontal scrolling after fixed columns).
     * @param {number} [gridY] - grid cell coordinate, adjusted (adjusted for vertical scrolling if data subgrid)
     * @constructor CellEvent
     */
    function CellEvent(gridX, gridY) {
        // remaining instance vars are non-enumerable so `CellEditor` constructor won't mix them in (for mustache use).
        Object.defineProperties(this, {
            /**
             * @name visibleColumn
             * @type {visibleColumnArray}
             * @memberOf CellEvent#
             */
            visibleColumn: writableDescriptor,

            /**
             * @name visibleRow
             * @type {visibleRowArray}
             * @memberOf CellEvent#
             */
            visibleRow: writableDescriptor,

            /**
             * @name subgrid
             * @type {dataModelAPI}
             * @memberOf CellEvent#
             */
            subgrid: writableDescriptor,

            /**
             * @name gridCell
             * @property {number} x - The active column index, adjusted for column scrolling after fixed columns; _i.e.,_
             * an index suitable for dereferencing the column object to which the cell belongs via {@link Behavior#getActiveColumn}.
             * @property {number} y - The vertical grid coordinate, unaffected by subgrid, row scrolling, and fixed rows.
             * @type {WritablePoint}
             * @memberOf CellEvent#
             */
            gridCell: {
                value: new WritablePoint
            },

            /**
             * @name dataCell
             * @property {number} x - The data model's column index, unaffected by column scrolling; _i.e.,_
             * an index suitable for dereferencing the column object to which the cell belongs via {@link Behavior#getColumn}.
             * @property {number} y - The data model's row index, adjusted for data row scrolling after fixed rows.
             * @type {WritablePoint}
             * @memberOf CellEvent#
             */
            dataCell: {
                value: new WritablePoint
            },

            /**
             * A reference to the {@link Column} object representing the column to which the cell belongs.
             * @name column
             * @type {Column}
             * Enumerable so it will be copied to cell event on CellEvent.prototype.initialize.
             * @memberOf CellEvent#
             */
            column: eumerableDescriptor,

            // getter caches
            _columnProperties: writableDescriptor,
            _cellOwnProperties: writableDescriptor,
            _bounds: writableDescriptor,

            // Following supports cell renderers' "partial render" capability:
            snapshot: writableDescriptor,
            minWidth: writableDescriptor,
            disabled: writableDescriptor
        });

        if (arguments.length) {
            this.resetGridCY(gridX, gridY);
        }
    }

    CellEvent.prototype = Object.create(factory.cellEventProperties, {
        constructor: { value: CellEvent },
        grid: { value: grid },
        renderer: { value: grid.renderer },
        selectionModel: { value: grid.selectionModel },
        behavior: { value: grid.behavior },
        dataModel: { value: grid.behavior.dataModel }
    });

    return CellEvent;
}

module.exports = factory;

},{"./WritablePoint":82}],84:[function(require,module,exports){
'use strict';

// console.warn polyfill as needed
// used for deprecation warnings
if (!console.warn) {
    console.warn = function() {
        console.log.apply(console, ['WARNING:'].concat(Array.prototype.slice.call(arguments)));
    };
}

var regexIsMethod = /^\w+\(.*\)$/;

/**
 * User is warned and new property is returned or new method is called and the result is returned.
 * @param {string} methodName - Warning key paired with arbitrary warning in `dotProps` OR deprecated method name with parentheses containing optional argument list paired with replacement property or method in `dotProps`.
 * @param {string} dotProps - Arbitrary warning paired with warning key in `methodName` OR dot-separated new property name to invoke or method name to call. Method names are indicated by including parentheses with optional argument list. The arguments in each list are drawn from the arguments presented in the `methodName` parameter.
 * @param {string} since - Version in which the name was deprecated.
 * @param {Arguments|Array} [args] - The actual arguments in the order listed in `methodName`. Only needed when arguments need to be forwarded.
 * @param {string} [notes] - Notes to add to message.
 * @returns {*} Return value of new property or method call.
 */
var deprecated = function(methodName, dotProps, since, args, notes) {
    if (typeof args === 'string') {
        // `args` omitted
        notes = args;
        args = undefined;
    }

    var chain = dotProps.split('.'),
        warned = this.$$DEPRECATION_WARNED = this.$$DEPRECATION_WARNED || {},
        result = this,
        isSimpleWarning = dotProps.indexOf(' ') >= 0,
        isMethodCall = regexIsMethod.test(methodName),
        memberType,
        warning;

    if (!(methodName in warned)) {
        warned[methodName] = deprecated.warnings;
    }

    if (isMethodCall) {
        if (isSimpleWarning) {
            throw 'Expected replacement method or property in 2nd parameter of deprecated() call.';
        } else if (warned[methodName]) {
            --warned[methodName];
            memberType = regexIsMethod.test(dotProps) ? 'method' : 'property';
            warning = 'The .' + methodName + ' method has been deprecated as of v' + since +
                ' in favor of the .' + chain.join('.') + ' ' + memberType + '.' +
                ' (Will be removed in a future release.)';

            if (notes) {
                warning += ' ' + notes;
            }

            console.warn(warning);
        }
    } else if (isSimpleWarning) {
        if (warned[methodName]) {
            --warned[methodName];
            console.warn(dotProps);
        }
        return;
    } else {
        throw 'Expected method name with parentheses in 1st parameter OR simple warning (containing one or more spaces) in 2nd parameter of deprecated() call.';
    }

    var formalArgList = argList(methodName);

    function mapToFormalArg(argName) {
        var index = formalArgList.indexOf(argName);
        if (index === -1) {
            throw 'Actual arg "' + argName + '" not found in formal arg list ' + formalArgList;
        }
        return args[index];
    }

    for (var i = 0, last = chain.length - 1; i <= last; ++i) {
        var link = chain[i],
            name = link.match(/\w+/)[0],
            linkIsMethodCall = regexIsMethod.test(link),
            actualArgList = linkIsMethodCall ? argList(link) : undefined,
            actualArgs = [];

        if (actualArgList) {
            actualArgs = actualArgList.map(mapToFormalArg);
            result = result[name].apply(result, actualArgs);
        } else if (linkIsMethodCall) {
            result = result[name]();
        } else {
            result = result[name];
        }
    }

    return result;
};

deprecated.warnings = 1; // 3 or 5 would get more attention

function argList(s) {
    return s.match(/^\w+\((.*)\)$/)[1].match(/(\w+)/g);
}

module.exports = deprecated;

},{}],85:[function(require,module,exports){
'use strict';

var warnedDoubleClickDelay;

/**
 * @summary Dynamic grid property getter/setters.
 * @desc  Dynamic grid properties can make use of a _backing store._
 * This backing store is created in the same layer (the grid properties layer) by {@link Hypergrid#clearState|clearState} and backs grid-only properties. We currently do not create one for descendant objects, such as column and cell properties objects.
 * The members of the backing store have the same names as the dynamic properties that utilize them.
 * They are initialized by {@link Hypergrid#clearState|clearState} to the default values from {@link module:defaults|defaults} object members, (also) of the same name.
 *
 * Note that dynamic properties must enumerable to be visible to {@link Hypergrid#saveState}.
 * @name dynamicPropertyDescriptors
 * @module
 */
var dynamicPropertyDescriptors = {
    /**
     * @returns {string|undefined|object} One of:
     * * **string:** When theme name is registered (except 'default').
     * * **undefined:** When theme layer is empty (or theme name is 'default').
     * * **object:** When theme name is not registered.
     * @memberOf module:dynamicPropertyDescriptors
     */
    theme: {
        enumerable: true,
        get: function() {
            return this.grid.getTheme();
        },
        set: function(theme) {
            this.grid.applyTheme(theme);
        }
    },

    /**
     * @memberOf module:dynamicPropertyDescriptors
     */
    subgrids: {
        enumerable: true,
        get: function() {
            return this.var.subgrids;
        },
        set: function(subgrids) {
            this.var.subgrids = subgrids;

            if (this.grid.behavior) {
                this.grid.behavior.subgrids = subgrids;
            }
        }
    },

    /**
     * @memberOf module:dynamicPropertyDescriptors
     */
    features: {
        enumerable: true,
        get: function() {
            return this.var.features;
        },
        set: function(features) {
            this.var.features = features;
            if (this.grid.behavior) {
                this.grid.behavior.initializeFeatureChain(features);
                this.grid.allowEvents(this.grid.getRowCount());
            }
        }
    },

    /**
     * @memberOf module:dynamicPropertyDescriptors
     */
    gridRenderer: {
        enumerable: true,
        get: function() {
            return this.var.gridRenderer;
        },
        set: function(rendererName) {
            this.var.gridRenderer = rendererName;
            this.grid.renderer.setGridRenderer(rendererName);
        }
    },

    /**
     * @memberOf module:dynamicPropertyDescriptors
     */
    columnIndexes: {
        enumerable: true,
        get: function() {
            return this.grid.behavior.getActiveColumns().map(function(column) {
                return column.index;
            });
        },
        set: function(columnIndexes) {
            this.grid.behavior.setColumnOrder(columnIndexes);
            this.grid.behavior.changed();
        }
    },

    /**
     * @memberOf module:dynamicPropertyDescriptors
     */
    columnNames: {
        enumerable: true,
        get: function() {
            return this.grid.behavior.getActiveColumns().map(function(column) {
                return column.name;
            });
        },
        set: function(columnNames) {
            this.grid.behavior.setColumnOrderByName(columnNames);
            this.grid.behavior.changed();
        }
    },

    /**
     * @memberOf module:dynamicPropertyDescriptors
     */
    rows: {
        enumerable: true,
        get: getRowPropertiesBySubgridAndRowIndex,
        set: function(rowsHash) {
            if (rowsHash) {
                setRowPropertiesBySubgridAndRowIndex.call(this, rowsHash);
                this.grid.behavior.changed();
            }
        }
    },

    /**
     * @memberOf module:dynamicPropertyDescriptors
     */
    columns: {
        enumerable: true,
        get: getColumnPropertiesByColumnName,
        set: function(columnsHash) {
            if (columnsHash) {
                setColumnPropertiesByColumnName.call(this, columnsHash);
                this.grid.behavior.changed();
            }
        }
    },

    /**
     * @memberOf module:dynamicPropertyDescriptors
     */
    cells: {
        enumerable: true,
        get: getCellPropertiesByColumnNameAndRowIndex,
        set: function(cellsHash) {
            if (cellsHash) {
                setCellPropertiesByColumnNameAndRowIndex.call(this, cellsHash);
                this.grid.behavior.changed();
            }
        }
    },

    /**
     * @memberOf module:dynamicPropertyDescriptors
     */
    rowHeaderCheckboxes: {
        enumerable: true,
        get: function() {
            return this.var.rowHeaderCheckboxes;
        },
        set: function(enabled) {
            this.var.rowHeaderCheckboxes = enabled;
            this.grid.renderer.resetRowHeaderColumnWidth();
        }
    },

    /**
     * @memberOf module:dynamicPropertyDescriptors
     */
    rowHeaderNumbers: {
        enumerable: true,
        get: function() {
            return this.var.rowHeaderNumbers;
        },
        set: function(enabled) {
            this.var.rowHeaderNumbers = enabled;
            this.grid.renderer.resetRowHeaderColumnWidth();
        }
    },

    /**
     * Legacy property; now points to both `rowHeaderFeatures` props.
     * @memberOf module:dynamicPropertyDescriptors
     */
    showRowNumbers: {
        enumerable: false,
        get: function() {
            return this.rowHeaderCheckboxes || this.rowHeaderNumbers;
        },
        set: function(enabled) {
            this.rowHeaderCheckboxes = this.rowHeaderNumbers = enabled;
        }
    },

    // remove to expire warning:
    doubleClickDelay: {
        enumerable: true,
        get: function() {
            return this.var.doubleClickDelay;
        },
        set: function(delay) {
            if (!warnedDoubleClickDelay) {
                warnedDoubleClickDelay = true;
                console.warn('The doubleClickDelay property has been deprecated as of v2.1.0. Setting this property no longer has any effect. Set double-click speed in your system\'s mouse preferences. (This warning will be removed in a future release.)');
            }
            this.var.doubleClickDelay = delay;
        }
    },

    // The following grid line props are now dynamic (as of v2.1.0).
    // They non-enumerable so they will not be output with `grid.saveState()`.
    // The new (as of 2.1.0) props they refer to is output instead:
    // `gridLinesHColor`, `gridLinesVColor`, `gridLinesHWidth`, and `gridLinesVWidth`
    lineColor: {
        get: function() { return this.gridLinesHColor; },
        set: function(color) { this.gridLinesHColor = this.gridLinesVColor = color; }
    },

    lineWidth: {
        get: function() { return this.gridLinesHWidth; },
        set: function(width) { this.gridLinesHWidth = this.gridLinesVWidth = width; }
    },

    gridBorder: getGridBorderDescriptor(),
    gridBorderLeft: getGridBorderDescriptor('Left'),
    gridBorderRight: getGridBorderDescriptor('Right'),
    gridBorderTop: getGridBorderDescriptor('Top'),
    gridBorderBottom: getGridBorderDescriptor('Bottom')
};

function getRowPropertiesBySubgridAndRowIndex() { // to be called with grid.properties as context
    var subgrids = {};
    var behavior = this.grid.behavior;
    behavior.subgrids.forEach(function(dataModel) {
        var key = dataModel.name || dataModel.type;
        for (var rowIndex = 0, rowCount = dataModel.getRowCount(); rowIndex < rowCount; ++rowIndex) {
            var rowProps = behavior.getRowProperties(rowIndex, undefined, dataModel);
            if (rowProps) {
                var subgrid = subgrids[key] = subgrids[key] || {};
                subgrid[rowIndex] = rowProps;
            }
        }
    });
    return subgrids;
}

function setRowPropertiesBySubgridAndRowIndex(rowsHash) { // to be called with grid.properties as context
    var behavior = this.grid.behavior;
    for (var subgridName in rowsHash) {
        if (rowsHash.hasOwnProperty(subgridName)) {
            var subgrid = behavior.subgrids.lookup[subgridName];
            if (subgrid) {
                var subgridHash = rowsHash[subgridName];
                for (var rowIndex in subgridHash) {
                    if (subgridHash.hasOwnProperty(rowIndex)) {
                        var properties = subgridHash[rowIndex];
                        for (var propName in properties) {
                            if (properties.hasOwnProperty(propName)) {
                                var propValue = properties[propName];
                                switch (propName) {
                                    case 'height':
                                        behavior.setRowHeight(rowIndex, Number(propValue), subgrid);
                                        break;
                                    default:
                                        console.warn('Unexpected row property "' + propName + '" ignored. (The only row property currently implemented is "height").');
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

function getColumnPropertiesByColumnName() { // to be called with grid.properties as context
    var columns = this.grid.behavior.getColumns(),
        headerify = this.grid.headerify;
    return columns.reduce(function(obj, column) {
        var properties = Object.keys(column.properties).reduce(function(properties, key) {
            switch (key) {
                case 'preferredWidth': // not a public property
                    break;
                case 'header':
                    if (headerify && column.properties.header === headerify(column.properties.name)) {
                        break;
                    }
                    // fallthrough
                default:
                    var value = column.properties[key];
                    if (value !== undefined) {
                        properties[key] = value;
                    }
            }
            return properties;
        }, {});
        if (Object.keys(properties).length) {
            obj[column.name] = properties;
        }
        return obj;
    }, {});
}

function setColumnPropertiesByColumnName(columnsHash) { // to be called with grid.properties as context
    var columns = this.grid.behavior.getColumns();

    for (var columnName in columnsHash) {
        if (columnsHash.hasOwnProperty(columnName)) {
            var column = columns.find(nameMatches);
            if (column) {
                column.properties = columnsHash[columnName];
            }
        }
    }

    function nameMatches(column) {
        return column.name === columnName;
    }
}

function getCellPropertiesByColumnNameAndRowIndex() {
    var behavior = this.grid.behavior,
        columns = behavior.getColumns(),
        subgrids = {};

    behavior.subgrids.forEach(function(dataModel) {
        var key = dataModel.name || dataModel.type;

        for (var rowIndex = 0, rowCount = dataModel.getRowCount(); rowIndex < rowCount; ++rowIndex) {
            columns.forEach(copyCellOwnProperties);
        }

        function copyCellOwnProperties(column) {
            var properties = behavior.getCellOwnProperties(column.index, rowIndex, dataModel);
            if (properties) {
                var subgrid = subgrids[key] = subgrids[key] || {},
                    row = subgrid[rowIndex] = subgrid[rowIndex] = {};
                row[column.name] = Object.assign({}, properties);
            }
        }
    });

    return subgrids;
}

function setCellPropertiesByColumnNameAndRowIndex(cellsHash) { // to be called with grid.properties as context
    var subgrids = this.grid.behavior.subgrids,
        columns = this.grid.behavior.getColumns();

    for (var subgridName in cellsHash) {
        if (cellsHash.hasOwnProperty(subgridName)) {
            var subgrid = subgrids.lookup[subgridName];
            if (subgrid) {
                var subgridHash = cellsHash[subgridName];
                for (var rowIndex in subgridHash) {
                    if (subgridHash.hasOwnProperty(rowIndex)) {
                        var columnProps = subgridHash[rowIndex];
                        for (var columnName in columnProps) {
                            if (columnProps.hasOwnProperty(columnName)) {
                                var column = columns.find(nameMatches);
                                if (column) {
                                    var properties = columnProps[columnName];
                                    column.addCellProperties(rowIndex, properties, subgrid);
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    function nameMatches(column) {
        return column.name === columnName;
    }
}

function getGridBorderDescriptor(edge) {
    edge = edge || '';

    var propName = 'gridBorder' + edge,
        styleName = 'border' + edge;

    return {
        enumerable: true,
        get: function() {
            return this.var[propName];
        },
        set: function(border) {
            this.var[propName] = border;
            if (!edge) {
                this.var.gridBorderLeft = this.var.gridBorderRight = this.var.gridBorderTop = this.var.gridBorderBottom = border;
            }
            switch (border) {
                case true:
                    border = this.lineWidth + 'px solid ' + this.lineColor;
                    break;
                case false:
                    border = null;
                    break;
            }
            this.grid.canvas.canvas.style[styleName] = border;
        }
    };
}

module.exports = dynamicPropertyDescriptors;

},{}],86:[function(require,module,exports){
'use strict';

function HypergridError(message) {
    this.message = message;
}

// extend from `Error`
HypergridError.prototype = Object.create(Error.prototype);

// override error name displayed in console
HypergridError.prototype.name = 'HypergridError';

module.exports = HypergridError;

},{}],87:[function(require,module,exports){
/* eslint-env browser */

'use strict';

var API;

function clearFill(x, y, width, height, color) {
    var a = alpha(color);
    if (a < 1) {
        // If background is translucent, we must clear the rect before the fillRect
        // below to prevent mixing with previous frame's render of this cell.
        this.clearRect(x, y, width, height);
    }
    if (a > 0) {
        this.cache.fillStyle = color;
        this.fillRect(x, y, width, height);
    }
}

var ALPHA_REGEX = /^(transparent|((RGB|HSL)A\(.*,\s*([\d\.]+)\)))$/i;
// Tried using an `alphaCache` here but it didn't make a measurable difference.
function alpha(cssColorSpec) {
    var matches, result;

    if (!cssColorSpec) {
        // undefined so not visible; treat as transparent
        result = 0;
    } else if ((matches = cssColorSpec.match(ALPHA_REGEX)) === null) {
        // an opaque color (a color spec with no alpha channel)
        result = 1;
    } else if (matches[4] === undefined) {
        // cssColorSpec must have been 'transparent'
        result = 0;
    } else {
        result = Number(matches[4]);
    }

    return result;
}

var fontMetrics = {};

/**
 * Accumulates width of string in pixels, character by character, by chaching character widths and reusing those values when previously cached.
 *
 * NOTE: There is a minor measuring error when taking the sum of the pixel widths of individual characters that make up a string vs. the pixel width of the string taken as a whole. This is possibly due to kerning or rounding. The error is typically about 0.1%.
 * @memberOf module:defaults
 * @param {CanvasRenderingContext2D} gc
 * @param {string} string - Text to measure.
 * @returns {nubmer} Width of string in pixels.
 */
function getTextWidth(string) {
    var metrics = fontMetrics[this.cache.font] = fontMetrics[this.cache.font] || {};
    string += '';
    for (var i = 0, sum = 0, len = string.length; i < len; ++i) {
        var c = string[i];
        sum += metrics[c] = metrics[c] || this.measureText(c).width;
    }
    return sum;
}

var ELLIPSIS = '\u2026'; // The "…" (dot-dot-dot) character

/**
 * Similar to `getTextWidth` except:
 * 1. Aborts accumulating when sum exceeds given `width`.
 * 2. Returns an object containing both the truncated string and the sum (rather than a number primitive containing the sum alone).
 * @param {CanvasRenderingContext2D} gc
 * @param {string} string - Text to measure.
 * @param {number} width - Width of target cell; overflow point.
 * @param {boolean|null|undefined} truncateTextWithEllipsis - See {@link module:defaults.truncateTextWithEllipsis}.
 * @param {boolean} [abort=false] - Abort measuring upon overflow. Returned `width` sum will reflect truncated string rather than untruncated string. Note that returned `string` is truncated in either case.
 * @returns {{string:string,width:number}}
 * * `object.string` - `undefined` if it fits; truncated version of provided `string` if it does not.
 * * `object.width` - Width of provided `string` if it fits; width of truncated string if it does not.
 */
function getTextWidthTruncated(string, width, truncateTextWithEllipsis, abort) {
    var metrics = fontMetrics[this.cache.font],
        truncating = truncateTextWithEllipsis !== undefined,
        truncString, truncWidth, truncAt;

    if (!metrics) {
        metrics = fontMetrics[this.cache.font] = {};
        metrics[ELLIPSIS] = this.measureText(ELLIPSIS).width;
    }

    string += ''; // convert to string
    width += truncateTextWithEllipsis === false ? 2 : -1; // fudge for inequality
    for (var i = 0, sum = 0, len = string.length; i < len; ++i) {
        var char = string[i];
        var charWidth = metrics[char] = metrics[char] || this.measureText(char).width;
        sum += charWidth;
        if (!truncString && truncating && sum > width) {
            truncAt = i;
            switch (truncateTextWithEllipsis) {
                case true: // truncate sufficient characters to fit ellipsis if possible
                    truncWidth = sum - charWidth + metrics[ELLIPSIS];
                    while (truncAt && truncWidth > width) {
                        truncWidth -= metrics[string[--truncAt]];
                    }
                    truncString = truncWidth > width
                        ? '' // not enough room even for ellipsis
                        : truncString = string.substr(0, truncAt) + ELLIPSIS;
                    break;
                case false: // truncate *before* last partially visible character
                    truncString = string.substr(0, truncAt);
                    break;
                default: // truncate *after* partially visible character
                    if (++truncAt < string.length) {
                        truncString = string.substr(0, truncAt);
                    }
            }
            if (abort) { break; }
        }
    }
    return {
        string: truncString,
        width: sum
    };
}

var fontData = {};

/**
 * @memberOf module:defaults
 * @param font
 * @returns {*}
 */
function getTextHeight(font) {
    var result = fontData[font];

    if (!result) {
        result = {};

        var text = document.createElement('span');
        text.textContent = 'Hg';
        text.style.font = font;

        var block = document.createElement('div');
        block.style.display = 'inline-block';
        block.style.width = '1px';
        block.style.height = '0px';

        var div = document.createElement('div');
        div.appendChild(text);
        div.appendChild(block);

        div.style.position = 'absolute';
        document.body.appendChild(div);

        try {

            block.style.verticalAlign = 'baseline';

            var blockRect = block.getBoundingClientRect();
            var textRect = text.getBoundingClientRect();

            result.ascent = blockRect.top - textRect.top;

            block.style.verticalAlign = 'bottom';
            result.height = blockRect.top - textRect.top;

            result.descent = result.height - result.ascent;

        } finally {
            document.body.removeChild(div);
        }
        if (result.height !== 0) {
            fontData[font] = result;
        }
    }

    return result;
}

function clipSave(conditional, x, y, width, height) {
    this.conditionalsStack.push(conditional);
    if (conditional) {
        this.cache.save();
        this.beginPath();
        this.rect(x, y, width, height);
        this.clip();
    }
}

function clipRestore(conditional) {
    if (this.conditionalsStack.pop()) {
        this.cache.restore(); // Remove clip region
    }
}

API = {
    clearFill: clearFill,
    alpha: alpha,
    getTextWidth: getTextWidth,
    getTextWidthTruncated: getTextWidthTruncated,
    getTextHeight: getTextHeight,
    clipSave: clipSave,
    clipRestore: clipRestore,
    truncateTextWithEllipsis: true
};

module.exports = API;

},{}],88:[function(require,module,exports){
'use strict';


/* IMPORTANT NOTE:
 * If any of the modules listed below is removed from Hypergrid, the polyfill(s) they define must be added here!!!
 *
 * 1. object-iterators defines Array.prototype.find
 */


/* eslint-disable no-extend-native */

// https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Math/sign#Polyfill
// (Safari now supports Math.sign but IE still does not as of v11.)
Math.sign = Math.sign = function(x) {
    x = +x; // convert to a number
    if (x === 0 || isNaN(x)) {
        return x;
    }
    return x > 0 ? 1 : -1;
};

// Lite version of: https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Array/findIndex#Polyfill
if (typeof Array.prototype.findIndex !== 'function') {
    Array.prototype.findIndex = function(predicate) {
        var context = arguments[1];
        for (var i = 0, len = this.length; i < len; i++) {
            if (predicate.call(context, this[i], i, this)) {
                return i;
            }
        }
        return -1;
    };
}

// Simpler version of: https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Array/fill#Polyfill
if (typeof Array.prototype.fill !== 'function') {
    Array.prototype.fill = function(value, start, end) {
        start = start === undefined ? 0 : start < 0 ? this.length + start : start;
        end = end === undefined ? this.length : end < 0 ? this.length + end : end;
        for (var i = start || 0; i < end; ++i) {
            this[i] = value;
        }
        return this;
    };
}

// Lite version of: https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Object/assign#Polyfill
if (typeof Object.assign !== 'function') {
    Object.assign = function(target) {
        for (var index = 1; index < arguments.length; index++) {
            var source = arguments[index];
            if (source != null) {
                for (var nextKey in source) {
                    if (source.hasOwnProperty(nextKey)) {
                        target[nextKey] = source[nextKey];
                    }
                }
            }
        }
        return target;
    };
}

if (typeof Object.getOwnPropertyDescriptors !== 'function') {
    Object.getOwnPropertyDescriptors = function(object) {
        return Object.getOwnPropertyNames(object).reduce(function(descriptors, key) {
            descriptors[key] = Object.getOwnPropertyDescriptor(object, key);
            return descriptors;
        }, {});
    };
}

},{}],89:[function(require,module,exports){
'use strict';

/**
 * @param {function|string} string
 * @returns {function}
 * @private
 */
module.exports = function(string) {
    switch (typeof string) {
        case 'undefined':
        case 'function':
            return string;
        case 'string':
            break;
        default:
            throw 'Expected string, function, or undefined.';
    }

    var args = string.match(/^function\s*\w*\s*\(([^]*?)\)/);
    if (!args) {
        throw 'Expected function keyword with formal parameter list.';
    }
    args = args[1].split(',').map(function(s, i) {
        s = s.match(/\s*(\w*)\s*/); // trim each argument
        if (!s && i) {
            throw 'Expected formal parameter.';
        }
        return s[1];
    });

    var body = string.match(/{\s*([^]*?)\s*}/);
    if (!body) {
        throw 'Expected function body.';
    }
    body = body[1];

    if (args.length === 1 && !args[0]) {
        args[0] = body;
    } else {
        args = args.concat(body);
    }

    return Function.apply(null, args);
};

},{}],90:[function(require,module,exports){
'use strict';

function bundleColumns(resetCellEvents) {
    var gridProps = this.grid.properties,
        vr, visibleRows = this.visibleRows,
        r, R = visibleRows.length, pool;

    if (resetCellEvents) {
        pool = this.cellEventPool;
        var p = 0;
        this.visibleColumns.forEachWithNeg(function(vc) {
            for (r = 0; r < R; r++, p++) {
                vr = visibleRows[r];
                // reset pool member to reflect coordinates of cell in newly shaped grid
                pool[p].reset(vc, vr);
            }
        });
    }

    var bundle,
        columnBundles = [],
        gridPrefillColor = gridProps.backgroundColor,
        backgroundColor;

    this.visibleColumns.forEachWithNeg(function(vc) {
        backgroundColor = vc.column.properties.backgroundColor;
        if (bundle && bundle.backgroundColor === backgroundColor) {
            bundle.right = vc.right;
        } else if (backgroundColor === gridPrefillColor) {
            bundle = undefined;
        } else {
            bundle = {
                backgroundColor: backgroundColor,
                left: vc.left,
                right: vc.right
            };
            columnBundles.push(bundle);
        }
    });

    this.columnBundles = columnBundles;
}

module.exports = bundleColumns;

},{}],91:[function(require,module,exports){
'use strict';

function bundleRows(resetCellEvents) {
    var gridProps = this.grid.properties,
        vr, visibleRows = this.visibleRows,
        r, R = visibleRows.length,
        p, pool;

    if (resetCellEvents) {
        pool = this.cellEventPool;
        for (p = 0, r = 0; r < R; r++) {
            vr = visibleRows[r];
            this.visibleColumns.forEachWithNeg(function(vc) { // eslint-disable-line no-loop-func
                p++;
                // reset pool member to reflect coordinates of cell in newly shaped grid
                pool[p].reset(vc, vr);
            });
        }
    }

    var bundle, rowBundles = [],
        gridPrefillColor = gridProps.backgroundColor,
        rowStripes = gridProps.rowStripes,
        rowPrefillColors = Array(R),
        stripe, backgroundColor;

    for (r = 0; r < R; r++) {
        vr = visibleRows[r]; // first cell in row r
        stripe = vr.subgrid.isData && rowStripes && rowStripes[vr.rowIndex % rowStripes.length];
        backgroundColor = rowPrefillColors[r] = stripe && stripe.backgroundColor || gridPrefillColor;
        if (bundle && bundle.backgroundColor === backgroundColor) {
            bundle.bottom = vr.bottom;
        } else if (backgroundColor === gridPrefillColor) {
            bundle = undefined;
        } else {
            bundle = {
                backgroundColor: backgroundColor,
                top: vr.top,
                bottom: vr.bottom
            };
            rowBundles.push(bundle);
        }
    }

    this.rowBundles = rowBundles;
    this.rowPrefillColors = rowPrefillColors;
}

module.exports = bundleRows;

},{}],92:[function(require,module,exports){
'use strict';

var paintCellsByColumnsAndRows = require('./by-columns-and-rows');

/** @summary Render the grid only as needed ("partial render").
 * @desc Paints all the cells of a grid, one column at a time, but only as needed.
 *
 * Paints all the cells of a grid, one row at a time.
 *
 * #### On reset
 *
 * Defers to {@link Renderer#paintCellsByColumnsAndRows|paintCellsByColumnsAndRows}, which clears the canvas, draws the grid, and draws the grid lines.
 *
 * #### On the next call (afer reset)
 *
 * First, a background rect is drawn using the grid background color.
 *
 * Then, each cell is drawn. If its background differs from the grid background, the background is repainted.
 *
 * `try...catch` surrounds each cell paint in case a cell renderer throws an error.
 * The error message is error-logged to console AND displayed in cell.
 *
 * #### On subsequent calls
 *
 * Iterates through each cell, calling `_paintCell` with `undefined` prefill color. This signifies partial render to the {@link SimpleCell} cell renderer, which only renders the cell when it's text, font, or colors have changed.
 *
 * Each cell to be rendered is described by a {@link CellEvent} object. For performance reasons, to avoid constantly instantiating these objects, we maintain a pool of these. When the grid shape changes, we reset their coordinates by setting {@link CellEvent#reset|reset} on each.
 *
 * See also the discussion of clipping in {@link Renderer#paintCellsByColumns|paintCellsByColumns}.
 * @this {Renderer}
 * @param {CanvasRenderingContext2D} gc
 * @memberOf Renderer.prototype
 */
function paintCellsAsNeeded(gc) {
    var cellEvent,
        visibleColumns = this.visibleColumns,
        visibleRows = this.visibleRows,
        C = visibleColumns.length, cLast = C - 1,
        r, R = visibleRows.length,
        p = 0, pool = this.cellEventPool,
        preferredWidth,
        columnClip,
        // clipToGrid,
        // viewWidth = C ? visibleColumns[cLast].right : 0,
        viewHeight = R ? visibleRows[R - 1].bottom : 0;


    if (!C || !R) { return; }

    if (this.gridRenderer.reset) {
        this.resetAllGridRenderers();
        paintCellsByColumnsAndRows.call(this, gc);
        this.gridRenderer.reset = false;
    }

    // gc.clipSave(clipToGrid, 0, 0, viewWidth, viewHeight);

    // For each column...
    this.visibleColumns.forEachWithNeg(function(vc, c) {
        cellEvent = pool[p]; // first cell in column c
        vc = cellEvent.visibleColumn;

        // Optionally clip to visible portion of column to prevent text from overflowing to right.
        columnClip = vc.column.properties.columnClip;
        gc.clipSave(columnClip || columnClip === null && c === cLast, 0, 0, vc.right, viewHeight);

        // For each row of each subgrid (of each column)...
        for (preferredWidth = r = 0; r < R; r++, p++) {
            cellEvent = pool[p]; // next cell down the column (redundant for first cell in column)

            try {
                preferredWidth = Math.max(preferredWidth, this._paintCell(gc, pool[p]));
            } catch (e) {
                this.renderErrorCell(e, gc, vc, pool[p].visibleRow);
            }
        }

        gc.clipRestore(columnClip);

        cellEvent.column.properties.preferredWidth = Math.round(preferredWidth);
    }.bind(this));

    // gc.clipRestore(clipToGrid);
}

paintCellsAsNeeded.key = 'by-cells';

paintCellsAsNeeded.partial = true; // skip painting selectionRegionOverlayColor

module.exports = paintCellsAsNeeded;

},{"./by-columns-and-rows":93}],93:[function(require,module,exports){
'use strict';

var bundleColumns = require('./bundle-columns');
var bundleRows = require('./bundle-rows');

/** @summary Render the grid with consolidated row OR column rects.
 * @desc Paints all the cells of a grid, one column at a time.
 *
 * First, a background rect is drawn using the grid background color.
 *
 * Then, if there are any rows with their own background color _that differs from the grid background color,_ these are consolidated and the consolidated groups of row backgrounds are all drawn before iterating through cells. These row backgrounds get priority over column backgrounds.
 *
 * If there are no such row background rects to draw, the column rects are consolidated and drawn instead (again, before the cells). Note that these column rects are _not_ suitable for clipping overflow text from previous columns. If you have overflow text, either turn on clipping (big performance hit) or turn on one of the `truncateTextWithEllipsis` options.
 *
 * `try...catch` surrounds each cell paint in case a cell renderer throws an error.
 * The error message is error-logged to console AND displayed in cell.
 *
 * Each cell to be rendered is described by a {@link CellEvent} object. For performance reasons, to avoid constantly instantiating these objects, we maintain a pool of these. When the grid shape changes, we reset their coordinates by setting {@link CellEvent#reset|reset} on each.
 *
 * See also the discussion of clipping in {@link Renderer#paintCellsByColumns|paintCellsByColumns}.
 * @this {Renderer}
 * @param {CanvasRenderingContext2D} gc
 * @memberOf Renderer.prototype
 */
function paintCellsByColumnsAndRows(gc) {
    var grid = this.grid,
        gridProps = grid.properties,
        prefillColor, rowPrefillColors, gridPrefillColor = gridProps.backgroundColor,
        cellEvent,
        rowBundle, rowBundles,
        columnBundle, columnBundles,
        visibleColumns = this.visibleColumns,
        visibleRows = this.visibleRows,
        c, C = visibleColumns.length,
        cLast = C - 1,
        r, R = visibleRows.length,
        pool = this.cellEventPool,
        preferredWidth,
        columnClip,
        // clipToGrid,
        viewWidth = C ? visibleColumns[C - 1].right : 0,
        viewHeight = R ? visibleRows[R - 1].bottom : 0;

    gc.clearRect(0, 0, this.bounds.width, this.bounds.height);

    if (!C || !R) { return; }

    if (gc.alpha(gridPrefillColor) > 0) {
        gc.cache.fillStyle = gridPrefillColor;
        gc.fillRect(0, 0, viewWidth, viewHeight);
    }

    if (this.gridRenderer.reset) {
        this.resetAllGridRenderers();
        this.gridRenderer.reset = false;
        bundleRows.call(this, false);
        bundleColumns.call(this, true);
    } else if (this.gridRenderer.rebundle) {
        this.gridRenderer.rebundle = false;
        bundleColumns.call(this);
    }

    rowBundles = this.rowBundles;
    if (rowBundles.length) {
        rowPrefillColors = this.rowPrefillColors;
        for (r = rowBundles.length; r--;) {
            rowBundle = rowBundles[r];
            gc.clearFill(0, rowBundle.top, viewWidth, rowBundle.bottom - rowBundle.top, rowBundle.backgroundColor);
        }
    } else {
        for (columnBundles = this.columnBundles, c = columnBundles.length; c--;) {
            columnBundle = columnBundles[c];
            gc.clearFill(columnBundle.left, 0, columnBundle.right - columnBundle.left, viewHeight, columnBundle.backgroundColor);
        }
    }

    // gc.clipSave(clipToGrid, 0, 0, viewWidth, viewHeight);

    // For each column...
    var p = 0;
    this.visibleColumns.forEachWithNeg(function(vc, c) {

        cellEvent = pool[p];
        vc = cellEvent.visibleColumn;

        if (!rowPrefillColors) {
            prefillColor = cellEvent.column.properties.backgroundColor;
        }

        // Optionally clip to visible portion of column to prevent text from overflowing to right.
        columnClip = vc.column.properties.columnClip;
        gc.clipSave(columnClip || columnClip === null && c === cLast, 0, 0, vc.right, viewHeight);

        // For each row of each subgrid (of each column)...
        for (preferredWidth = r = 0; r < R; r++, p++) {
            if (!pool[p].disabled) {
                if (rowPrefillColors) {
                    prefillColor = rowPrefillColors[r];
                }

                try {
                    preferredWidth = Math.max(preferredWidth, this._paintCell(gc, pool[p], prefillColor));
                } catch (e) {
                    this.renderErrorCell(e, gc, vc, pool[p].visibleRow);
                }
            }
        }

        gc.clipRestore(columnClip);

        cellEvent.column.properties.preferredWidth = Math.round(preferredWidth);
    }.bind(this));

    // gc.clipRestore(clipToGrid);

    this.paintGridlines(gc);
}

paintCellsByColumnsAndRows.key = 'by-columns-and-rows';
paintCellsByColumnsAndRows.rebundle = true; // see rebundleGridRenderers

module.exports = paintCellsByColumnsAndRows;

},{"./bundle-columns":90,"./bundle-rows":91}],94:[function(require,module,exports){
'use strict';

var bundleColumns = require('./bundle-columns');

/** @summary Render the grid with discrete column rects.
 * @desc Paints all the cells of a grid, one column at a time.
 *
 * In this grid renderer, a background rect is _not_ drawn using the grid background color.
 *
 * Rather, all columns paint their own background rects, with color defaulting to grid background color.
 *
 * The idea of painting each column rect is to "clip" text that might have overflowed from the previous column by painting over it with the background from this column. Only the last column will show overflowing text, and only if the canvas width exceeds the grid width. If this is the case, you can turn on clipping for the last column only by setting `columnClip` to `true` for the last column.
 *
 * NOTE: As a convenience feature, setting `columnClip` to `null` will clip only the last column, so simply setting it on the grid (rather than the last column) will have the same effect. This is much more convenient because you don't have to worry about the last column being redefined (moved, hidden, etc).
 *
 * `try...catch` surrounds each cell paint in case a cell renderer throws an error.
 * The error message is error-logged to console AND displayed in cell.
 *
 * Each cell to be rendered is described by a {@link CellEvent} object. For performance reasons, to avoid constantly instantiating these objects, we maintain a pool of these. When the grid shape changes, we reset their coordinates by setting {@link CellEvent#reset|reset} on each.
 *
 * See also the discussion of clipping in {@link Renderer#paintCellsByColumnsDiscrete|paintCellsByColumnsDiscrete}.

 * @this {Renderer}
 * @param {CanvasRenderingContext2D} gc
 * @memberOf Renderer.prototype
 */
function paintCellsByColumnsDiscrete(gc) {
    var prefillColor,
        cellEvent,
        visibleColumns = this.visibleColumns,
        visibleRows = this.visibleRows,
        C = visibleColumns.length, cLast = C - 1,
        r, R = visibleRows.length,
        pool = this.cellEventPool,
        preferredWidth,
        columnClip,
        // clipToGrid,
        // viewWidth = C ? visibleColumns[C - 1].right : 0,
        viewHeight = R ? visibleRows[R - 1].bottom : 0;

    gc.clearRect(0, 0, this.bounds.width, this.bounds.height);

    if (!C || !R) { return; }

    if (this.gridRenderer.reset) {
        this.resetAllGridRenderers(['by-columns']);
        this.gridRenderer.reset = false;
        bundleColumns.call(this, true);
    }

    // gc.clipSave(clipToGrid, 0, 0, viewWidth, viewHeight);

    // For each column...
    var p = 0;
    this.visibleColumns.forEachWithNeg(function(vc, c) {
        cellEvent = pool[p]; // first cell in column c
        vc = cellEvent.visibleColumn;

        prefillColor = cellEvent.column.properties.backgroundColor;
        gc.clearFill(vc.left, 0, vc.width, viewHeight, prefillColor);

        // Optionally clip to visible portion of column to prevent text from overflowing to right.
        columnClip = vc.column.properties.columnClip;
        gc.clipSave(columnClip || columnClip === null && c === cLast, 0, 0, vc.right, viewHeight);

        // For each row of each subgrid (of each column)...
        for (preferredWidth = r = 0; r < R; r++, p++) {
            cellEvent = pool[p]; // next cell down the column (redundant for first cell in column)

            try {
                preferredWidth = Math.max(preferredWidth, this._paintCell(gc, cellEvent, prefillColor));
            } catch (e) {
                this.renderErrorCell(e, gc, vc, cellEvent.visibleRow);
            }
        }

        gc.clipRestore(columnClip);

        cellEvent.column.properties.preferredWidth = Math.round(preferredWidth);
    }.bind(this));

    // gc.clipRestore(clipToGrid);

    this.paintGridlines(gc);
}

paintCellsByColumnsDiscrete.key = 'by-columns-discrete';

module.exports = paintCellsByColumnsDiscrete;

},{"./bundle-columns":90}],95:[function(require,module,exports){
'use strict';

var bundleColumns = require('./bundle-columns');

/** @summary Render the grid with consolidated column rects.
 * @desc Paints all the cells of a grid, one column at a time.
 *
 * First, a background rect is drawn using the grid background color.
 *
 * Then, if there are any columns with their own background color _that differs from the grid background color,_ these are consolidated and the consolidated groups of column backgrounds are all drawn before iterating through cells. Note that these column rects are _not_ suitable for clipping overflow text from previous columns. If you have overflow text, either turn on clipping (big performance hit) or turn on one of the `truncateTextWithEllipsis` options.
 *
 * `try...catch` surrounds each cell paint in case a cell renderer throws an error.
 * The error message is error-logged to console AND displayed in cell.
 *
 * Each cell to be rendered is described by a {@link CellEvent} object. For performance reasons, to avoid constantly instantiating these objects, we maintain a pool of these. When the grid shape changes, we reset their coordinates by setting {@link CellEvent#reset|reset} on each.
 *
 * **Regading clipping.** The reason for clipping is to prevent text from overflowing into the next column. However there is a serious performance cost.
 *
 * For performance reasons {@link Renderer#_paintCell|_paintCell} does not set up a clipping region for each cell. However, iff grid property `columnClip` is truthy, this grid renderer will set up a clipping region to prevent text overflow to right. If `columnClip` is `null`, a clipping region will only be set up on the last column. Otherwise, there will be no clipping region.
 *
 * The idea of clipping just the last column is because in addition to the optional graphics clipping, we also clip ("truncate") text. Text can be truncated conservatively so it will never overflow. The problem with this is that characters vanish as they hit the right cell boundary, which may or may be obvious depending on font size. Alternatively, text can be truncated so that the overflow will be a maximum of 1 character. This allows partial characters to be rendered. But this is where graphics clipping is required.
 *
 * When renderering column by column as this particular renderer does, _and_ when the background color _of the next cell to the right_ is opaque (alpha = 1), clipping can be turned off because each column will _overpaint_ any text that overflowed from the one before. However, any text that overflows the last column will paint into unused canvas region to the right of the grid. This is the _raison d'être_ for "clip last column only" option mentioned above (when `columnClip` is set to `null`). To avoid even this performance cost (of clipping just the last column), column widths can be set to fill the available canvas.
 *
 * Note that text never overflows to left because text starting point is never < 0. The reason we don't clip to the left is for cell renderers that need to re-render to the left to produce a merged cell effect, such as grouped column header.

 * @this {Renderer}
 * @param {CanvasRenderingContext2D} gc
 * @memberOf Renderer.prototype
 */
function paintCellsByColumns(gc) {
    var grid = this.grid,
        gridProps = grid.properties,
        prefillColor, gridPrefillColor = gridProps.backgroundColor,
        cellEvent,
        columnBundle, columnBundles,
        visibleColumns = this.visibleColumns,
        visibleRows = this.visibleRows,
        c, C = visibleColumns.length, cLast = C - 1,
        r, R = visibleRows.length,
        pool = this.cellEventPool,
        preferredWidth,
        columnClip,
        // clipToGrid,
        viewWidth = C ? visibleColumns[cLast].right : 0,
        viewHeight = R ? visibleRows[R - 1].bottom : 0;


    gc.clearRect(0, 0, this.bounds.width, this.bounds.height);

    if (!C || !R) { return; }

    if (gc.alpha(gridPrefillColor) > 0) {
        gc.cache.fillStyle = gridPrefillColor;
        gc.fillRect(0, 0, viewWidth, viewHeight);
    }

    if (this.gridRenderer.reset) {
        this.resetAllGridRenderers(['by-columns-discrete']);
        this.gridRenderer.reset = false;
        bundleColumns.call(this, true);
    } else if (this.gridRenderer.rebundle) {
        this.gridRenderer.rebundle = false;
        bundleColumns.call(this);
    }

    for (columnBundles = this.columnBundles, c = columnBundles.length; c--;) {
        columnBundle = columnBundles[c];
        gc.clearFill(columnBundle.left, 0, columnBundle.right - columnBundle.left, viewHeight, columnBundle.backgroundColor);
    }

    // gc.clipSave(clipToGrid, 0, 0, viewWidth, viewHeight);

    // For each column...
    var p = 0;
    this.visibleColumns.forEachWithNeg(function(vc, c) {
        cellEvent = pool[p]; // first cell in column c
        vc = cellEvent.visibleColumn;

        prefillColor = cellEvent.column.properties.backgroundColor;

        // Optionally clip to visible portion of column to prevent text from overflowing to right.
        columnClip = vc.column.properties.columnClip;
        gc.clipSave(columnClip || columnClip === null && c === cLast, 0, 0, vc.right, viewHeight);

        // For each row of each subgrid (of each column)...
        for (preferredWidth = r = 0; r < R; r++, p++) {
            cellEvent = pool[p]; // next cell down the column (redundant for first cell in column)

            try {
                preferredWidth = Math.max(preferredWidth, this._paintCell(gc, cellEvent, prefillColor));
            } catch (e) {
                this.renderErrorCell(e, gc, vc, cellEvent.visibleRow);
            }
        }

        gc.clipRestore(columnClip);

        cellEvent.column.properties.preferredWidth = Math.round(preferredWidth);
    }.bind(this));

    // gc.clipRestore(clipToGrid);

    this.paintGridlines(gc);
}

paintCellsByColumns.key = 'by-columns';
paintCellsByColumns.rebundle = true; // see rebundleGridRenderers

module.exports = paintCellsByColumns;

},{"./bundle-columns":90}],96:[function(require,module,exports){
'use strict';

var bundleRows = require('./bundle-rows');

/** @summary Render the grid.
 * @desc _**NOTE:** This grid renderer is not as performant as the others and it's use is not recommended if you care about performance. The reasons for the wanting performance are unclear, possibly having to do with the way Chrome optimizes access to the column objects?_
 *
 * Paints all the cells of a grid, one row at a time.
 *
 * First, a background rect is drawn using the grid background color.
 *
 * Then, if there are any rows with their own background color _that differs from the grid background color,_ these are consolidated and the consolidated groups of row backgrounds are all drawn before iterating through cells.
 *
 * `try...catch` surrounds each cell paint in case a cell renderer throws an error.
 * The error message is error-logged to console AND displayed in cell.
 *
 * Each cell to be rendered is described by a {@link CellEvent} object. For performance reasons, to avoid constantly instantiating these objects, we maintain a pool of these. When the grid shape changes, we reset their coordinates by setting {@link CellEvent#reset|reset} on each.
 *
 * See also the discussion of clipping in {@link Renderer#paintCellsByColumns|paintCellsByColumns}.
 * @this {Renderer}
 * @param {CanvasRenderingContext2D} gc
 * @memberOf Renderer.prototype
 */
function paintCellsByRows(gc) {
    var grid = this.grid,
        gridProps = grid.properties,
        prefillColor, rowPrefillColors, gridPrefillColor = gridProps.backgroundColor,
        cellEvent,
        rowBundle, rowBundles = this.rowBundles,
        visibleColumns = this.visibleColumns,
        vr, visibleRows = this.visibleRows,
        c, C = visibleColumns.length, c0 = 0, cLast = C - 1,
        r, R = visibleRows.length,
        p, pool = this.cellEventPool,
        preferredWidth = Array(C - c0).fill(0),
        columnClip,
        // clipToGrid,
        viewWidth = C ? visibleColumns[C - 1].right : 0,
        viewHeight = R ? visibleRows[R - 1].bottom : 0,
        drawLines = gridProps.gridLinesH,
        lineWidth = gridProps.gridLinesHWidth,
        lineColor = gridProps.gridLinesHColor;

    gc.clearRect(0, 0, this.bounds.width, this.bounds.height);

    if (!C || !R) { return; }

    if (gc.alpha(gridPrefillColor) > 0) {
        gc.cache.fillStyle = gridPrefillColor;
        gc.fillRect(0, 0, viewWidth, viewHeight);
    }

    if (this.gridRenderer.reset) {
        this.resetAllGridRenderers();
        this.gridRenderer.reset = false;
        bundleRows.call(this, true);
    }

    rowPrefillColors = this.rowPrefillColors;

    for (r = rowBundles.length; r--;) {
        rowBundle = rowBundles[r];
        gc.clearFill(0, rowBundle.top, viewWidth, rowBundle.bottom - rowBundle.top, rowBundle.backgroundColor);
    }

    // gc.clipSave(clipToGrid, 0, 0, viewWidth, viewHeight);

    // For each row of each subgrid...
    for (p = 0, r = 0; r < R; r++) {
        prefillColor = rowPrefillColors[r];

        if (drawLines) {
            gc.cache.fillStyle = lineColor;
            gc.fillRect(0, pool[p].visibleRow.bottom, viewWidth, lineWidth);
        }

        // For each column (of each row)...
        this.visibleColumns.forEachWithNeg(function(vc) {  // eslint-disable-line no-loop-func
            p++;
            cellEvent = pool[p]; // next cell across the row (redundant for first cell in row)
            vc = cellEvent.visibleColumn;

            // Optionally clip to visible portion of column to prevent text from overflowing to right.
            columnClip = vc.column.properties.columnClip;
            gc.clipSave(columnClip || columnClip === null && c === cLast, 0, 0, vc.right, viewHeight);

            try {
                preferredWidth[c] = Math.max(preferredWidth[c], this._paintCell(gc, cellEvent, prefillColor));
            } catch (e) {
                this.renderErrorCell(e, gc, vc, vr);
            }

            gc.clipRestore(columnClip);
        }.bind(this));
    }

    // gc.clipRestore(clipToGrid);

    this.paintGridlines(gc);

    this.visibleColumns.forEachWithNeg(function(vc, c) {
        vc.column.properties.preferredWidth = Math.round(preferredWidth[c]);
    });
}

paintCellsByRows.key = 'by-rows';

module.exports = paintCellsByRows;

},{"./bundle-rows":91}],97:[function(require,module,exports){
/* eslint-env browser */
/* global requestAnimationFrame */

'use strict';

var Base = require('../Base');
var images = require('../../images');


var propClassGet = [
    undefined,
    function(cellEvent) {
        return cellEvent.columnProperties;
    },
    function(cellEvent) {
        var rowStripes = cellEvent.isDataRow && cellEvent.columnProperties.rowStripes;
        return rowStripes && rowStripes[cellEvent.dataCell.y % rowStripes.length];
    },
    function(cellEvent) {
        return cellEvent.rowOwnProperties;
    },
    function(cellEvent) {
        return cellEvent.cellOwnProperties;
    }
];


var visibleColumnPropertiesDescriptorFn = function(grid) {
    return {
        findWithNeg: {
            // Like the Array.prototype version except searches the negative indexes as well.
            value: function(iteratee, context) {
                for (var i = grid.behavior.leftMostColIndex; i < 0; i++) {
                    if (!this[i]) {
                        continue;
                    }
                    if (iteratee.call(context, this[i], i, this)) {
                        return this[i];
                    }
                }
                return Array.prototype.find.call(this, iteratee, context);
            }
        },
        forEachWithNeg: {
            // Like the Array.prototype version except it iterates the negative indexes as well.
            value: function(iteratee, context) {
                for (var i = grid.behavior.leftMostColIndex; i < 0; i++) {
                    if (!this[i]) {
                        continue;
                    }
                    iteratee.call(context, this[i], i, this);
                }
                return Array.prototype.forEach.call(this, iteratee, context);
            }

        },

        totalLength: {
            get: function() {
                return Math.abs(grid.behavior.leftMostColIndex) + this.length;
            }
        }
    };
};


/**
 * @summary List of grid renderers available to new grid instances.
 * @desc Developer may augment this list with additional grid renderers before grid instantiation by calling @link {Renderer.registerGridRenderer}.
 * @memberOf Renderer~
 * @private
 * @type {function[]}
 */
var paintCellsFunctions = [];


/** @typedef {object} CanvasRenderingContext2D
 * @see [CanvasRenderingContext2D](https://developer.mozilla.org/docs/Web/API/CanvasRenderingContext2D)
 */

/** @typedef {object} visibleColumnArray
 * @property {number} index - A back reference to the element's array index in {@link Renderer#visibleColumns}.
 * @property {number} columnIndex - Dereferences {@link Behavior#columns}, the subset of _active_ columns, specifying which column to show in that position.
 * @property {number} left - Pixel coordinate of the left edge of this column, rounded to nearest integer.
 * @property {number} right - Pixel coordinate of the right edge of this column, rounded to nearest integer.
 * @property {number} width - Width of this column in pixels, rounded to nearest integer.
 */

/** @typedef {object} visibleRowArray
 * @property {number} index - A back reference to the element's array index in {@link Renderer#visibleRows}.
 * @property {number} rowIndex - Local vertical row coordinate within the subgrid to which the row belongs, adjusted for scrolling.
 * @property {dataModelAPI} subgrid - A reference to the subgrid to which the row belongs.
 * @property {number} top - Pixel coordinate of the top edge of this row, rounded to nearest integer.
 * @property {number} bottom - Pixel coordinate of the bottom edge of this row, rounded to nearest integer.
 * @property {number} height - Height of this row in pixels, rounded to nearest integer.
 */

/**
 * @constructor
 * @desc fin-hypergrid-renderer is the canvas enabled top level sub component that handles the renderering of the Grid.
 *
 * It relies on two other external subprojects
 *
 * 1. fin-canvas: a wrapper to provide a simpler interface to the HTML5 canvas component
 * 2. rectangular: a small npm module providing Point and Rectangle objects
 *
 * The fin-hypergrid-renderer is in a unique position to provide critical functionality to the fin-hypergrid in a hightly performant manner.
 * Because it MUST iterate over all the visible cells it can store various bits of information that can be encapsulated as a service for consumption by the fin-hypergrid component.
 *
 * Instances of this object have basically four main functions.
 *
 * 1. render fixed row headers
 * 2. render fixed col headers
 * 3. render main data cells
 * 4. render grid lines
 *
 * Same parameters as {@link Renderer#initialize|initialize}, which is called by this constructor.
 *
 */
var Renderer = Base.extend('Renderer', {

    //the shared single item "pooled" cell object for drawing each cell
    cell: {
        x: 0,
        y: 0,
        width: 0,
        height: 0
    },

    scrollHeight: 0,

    viewHeight: 0,

    reset: function() {
        this.bounds = {
            width: 0,
            height: 0
        };

        /**
         * Represents the ordered set of visible columns. Array size is always the exact number of visible columns, the last of which may only be partially visible.
         *
         * This sequence of elements' `columnIndex` values assumes one of three patterns. Which pattern is base on the following two questions:
         * * Are there "fixed" columns on the left?
         * * Is the grid horizontally scrolled?
         *
         * The set of `columnIndex` values consists of:
         * 1. The first element will be -1 if the row handle column is being rendered.
         * 2. A zero-based list of consecutive of integers representing the fixed columns (if any).
         * 3. An n-based list of consecutive of integers representing the scrollable columns (where n = number of fixed columns + the number of columns scrolled off to the left).
         * @type {visibleColumnArray}
         */
        this.visibleColumns = Object.defineProperties([], visibleColumnPropertiesDescriptorFn(this.grid));

        /**
         * Represents the ordered set of visible rows. Array size is always the exact number of visible rows.
         *
         * The sequence of elements' `rowIndex` values is local to each subgrid.
         * * **For each non-scrollable subgrid:** The sequence is a zero-based list of consecutive integers.
         * * **For the scrollable subgrid:**
         *   1. A zero-based list of consecutive of integers representing the fixed rows (if any).
         *   2. An n-based list of consecutive of integers representing the scrollable rows (where n = number of fixed rows + the number of rows scrolled off the top).
         *
         * Note that non-scrollable subgrids can come both before _and_ after the scrollable subgrid.
         * @type {visibleRowArray}
         */
        this.visibleRows = [];

        this.insertionBounds = [];

        this.cellEventPool = [];
    },

    /**
     * @summary Constructor logic
     * @desc This method will be called upon instantiation of this class or of any class that extends from this class.
     * > All `initialize()` methods in the inheritance chain are called, in turn, each with the same parameters that were passed to the constructor, beginning with that of the most "senior" class through that of the class of the new instance.
     * @memberOf Renderer.prototype
     */
    initialize: function(grid) {
        this.grid = grid;

        this.gridRenderers = {};
        paintCellsFunctions.forEach(function(paintCellsFunction) {
            this.registerGridRenderer(paintCellsFunction);
        }, this);

        // typically grid properties won't exist yet
        this.setGridRenderer(this.properties.gridRenderer || 'by-columns-and-rows');

        this.reset();
    },

    registerGridRenderer: function(paintCellsFunction) {
        this.gridRenderers[paintCellsFunction.key] = {
            paintCells: paintCellsFunction
        };
    },

    setGridRenderer: function(key) {
        var gridRenderer = this.gridRenderers[key];

        if (!gridRenderer) {
            throw new this.HypergridError('Unregistered grid renderer "' + key + '"');
        }

        if (gridRenderer !== this.gridRenderer) {
            this.gridRenderer = gridRenderer;
            this.gridRenderer.reset = true;
        }
    },

    resetAllGridRenderers: function(blackList) {
        // Notify renderers that grid shape has changed
        Object.keys(this.gridRenderers).forEach(function(key) {
            this.gridRenderers[key].reset = !blackList || blackList.indexOf(key) < 0;
        }, this);
    },

    /**
     * Certain renderers that pre-bundle column rects based on columns' background colors need to re-bundle when columns' background colors change. This method sets the `rebundle` property to `true` for those renderers that have that property.
     */
    rebundleGridRenderers: function() {
        Object.keys(this.gridRenderers).forEach(function(key) {
            if (this.gridRenderers[key].paintCells.rebundle) {
                this.gridRenderers[key].rebundle = true;
            }
        }, this);
    },

    resetRowHeaderColumnWidth: function() {
        this.lastKnowRowCount = undefined;
    },

    computeCellsBounds: function() {
        this.needsComputeCellsBounds = true;
    },

    /**
     * CAUTION: Keep in place! Used by {@link Canvas}.
     * @memberOf Renderer.prototype
     * @returns {Object} The current grid properties object.
     */
    get properties() {
        return this.grid.properties;
    },

    /**
     * @memberOf Renderer.prototype
     * @summary Notify the fin-hypergrid every time we've repainted.
     * @desc This is the entry point from fin-canvas.
     * @param {CanvasRenderingContext2D} gc
     */
    paint: function(gc) {
        if (this.grid.canvas) {
            this.renderGrid(gc);
            this.grid.gridRenderedNotification();
        }
    },

    tickNotification: function() {
        this.grid.tickNotification();
    },

    /**
     * @memberOf Renderer.prototype
     * @returns {number} Answer how many rows we rendered
     */
    getVisibleRowsCount: function() {
        return this.visibleRows.length - 1;
    },

    getVisibleScrollHeight: function() {
        return this.viewHeight - this.grid.getFixedRowsHeight();
    },

    /**
     * @memberOf Renderer.prototype
     * @returns {number} Number of columns we just rendered.
     */
    getVisibleColumnsCount: function() {
        return this.visibleColumns.length - 1;
    },

    /**
     * @memberOf Renderer.prototype
     * @param {CellEvent|number} x - CellEvent object or grid column coordinate.
     * @param {number} [y] - Grid row coordinate. Omit if `xOrCellEvent` is a CellEvent.
     * @returns {Rectangle} Bounding rect of cell with the given coordinates.
     */
    getBoundsOfCell: function(x, y) {
        var vc = this.visibleColumns[x],
            vr = this.visibleRows[y];

        return {
            x: vc.left,
            y: vr.top,
            width: vc.width,
            height: vr.height
        };
    },

    /**
     * @memberOf Renderer.prototype
     * @desc answer the column index under the coordinate at pixelX
     * @param {number} pixelX - The horizontal coordinate.
     * @returns {number} The column index under the coordinate at pixelX.
     */
    getColumnFromPixelX: function(pixelX) {
        var width = 0,
            fixedColumnCount = this.grid.getFixedColumnCount(),
            scrollLeft = this.grid.getHScrollValue(),
            visibleColumns = this.visibleColumns;

        for (var c = 1; c < visibleColumns.length - 1; c++) {
            width = visibleColumns[c].left - (visibleColumns[c].left - visibleColumns[c - 1].left) / 2;
            if (pixelX < width) {
                if (c > fixedColumnCount) {
                    c += scrollLeft;
                }
                return c - 1;
            }
        }
        if (c > fixedColumnCount) {
            c += scrollLeft;
        }
        return c - 1;
    },


    /**
     * @memberOf Renderer.prototype
     * @desc Answer specific data cell coordinates given mouse coordinates in pixels.
     * @param {Point} point
     * @returns {Point} Cell coordinates
     */
    getGridCellFromMousePoint: function(point) {

        var x = point.x,
            y = point.y,
            isPseudoRow = false,
            isPseudoCol = false,
            vrs = this.visibleRows,
            vcs = this.visibleColumns,
            firstColumn = vcs[this.grid.behavior.leftMostColIndex],
            inFirstColumn = x < firstColumn.right,
            vc = inFirstColumn ? firstColumn : vcs.findWithNeg(function(vc) { return x < vc.right; }),
            vr = vrs.find(function(vr) { return y < vr.bottom; }),
            result = {fake: false};

        //default to last row and col
        if (vr) {
            isPseudoRow = false;
        } else {
            vr = vrs[vrs.length - 1];
            isPseudoRow = true;
        }

        if (vc) {
            isPseudoCol = false;
        } else {
            vc = vcs[vcs.length - 1];
            isPseudoCol = true;
        }

        var mousePoint = this.grid.newPoint(x - vc.left, y - vr.top),
            cellEvent = new this.grid.behavior.CellEvent(vc.columnIndex, vr.index);

        // cellEvent.visibleColumn = vc;
        // cellEvent.visibleRow = vr;

        result.cellEvent = Object.defineProperty(cellEvent, 'mousePoint', {value: mousePoint});

        if (isPseudoCol || isPseudoRow) {
            result.fake = true;
            this.grid.beCursor(null);
        }

        return result;
    },

    /**
     * @summary Get the visibility of the column matching the provided grid column index.
     * @desc Requested column may not be visible due to being scrolled out of view.
     * @memberOf Renderer.prototype
     * @summary Determines if a column is visible.
     * @param {number} columnIndex - the column index
     * @returns {boolean} The given column is visible.
     */
    isColumnVisible: function(columnIndex) {
        return !!this.getVisibleColumn(columnIndex);
    },

    /**
     * @summary Get the "visible column" object matching the provided grid column index.
     * @desc Requested column may not be visible due to being scrolled out of view.
     * @memberOf Renderer.prototype
     * @summary Find a visible column object.
     * @param {number} columnIndex - The grid column index.
     * @returns {object|undefined} The given column if visible or `undefined` if not.
     */
    getVisibleColumn: function(columnIndex) {
        return this.visibleColumns.findWithNeg(function(vc) {
            return vc.columnIndex === columnIndex;
        });
    },

    /**
     * @desc Calculate the minimum left column index so the target column shows up in viewport (we need to be aware of viewport's width, number of fixed columns and each column's width)
     * @param {number} targetColIdx - Target column index
     * @returns {number} Minimum left column index so target column shows up
     */
    getMinimumLeftPositionToShowColumn: function(targetColIdx) {
        var fixedColumnCount = this.grid.getFixedColumnCount();
        var fixedColumnsWidth = 0;
        var rowNumbersWidth = 0;
        var filtersWidth = 0;
        var viewportWidth = 0;
        var leftColIdx = 0;
        var targetRight = 0;
        var lastFixedColumn = null;
        var computedCols = [];
        var col = null;
        var i = 0;
        var left = 0;
        var right = 0;


        // 1) for each column, we'll compute left and right position in pixels (until target column)
        for (i = 0; i <= targetColIdx; i++) {
            left = right;
            right += Math.ceil(this.grid.getColumnWidth(i));

            computedCols.push({
                left: left,
                right: right
            });
        }

        targetRight = computedCols[computedCols.length - 1].right;

        // 2) calc usable viewport width
        lastFixedColumn = computedCols[fixedColumnCount - 1];

        if (this.properties.showRowNumbers) {
            rowNumbersWidth = this.grid.getColumnWidth(this.grid.behavior.rowColumnIndex);
        }

        if (this.grid.hasTreeColumn()) {
            filtersWidth = this.grid.getColumnWidth(this.grid.behavior.treeColumnIndex);
        }

        fixedColumnsWidth = lastFixedColumn ? lastFixedColumn.right : 0;
        viewportWidth = this.getBounds().width - fixedColumnsWidth - rowNumbersWidth - filtersWidth;

        // 3) from right to left, find the last column that can still render target column
        i = targetColIdx;

        do {
            leftColIdx = i;
            col = computedCols[i];
            i--;
        } while (col.left + viewportWidth > targetRight && i >= 0);

        return leftColIdx;
    },

    /**
     * @summary Get the visibility of the column matching the provided data column index.
     * @desc Requested column may not be visible due to being scrolled out of view or if the column is inactive.
     * @memberOf Renderer.prototype
     * @summary Determines if a column is visible.
     * @param {number} columnIndex - the column index
     * @returns {boolean} The given column is visible.
     */
    isDataColumnVisible: function(columnIndex) {
        return !!this.getVisibleDataColumn(columnIndex);
    },

    /**
     * @summary Get the "visible column" object matching the provided data column index.
     * @desc Requested column may not be visible due to being scrolled out of view or if the column is inactive.
     * @memberOf Renderer.prototype
     * @summary Find a visible column object.
     * @param {number} columnIndex - The grid column index.
     * @returns {object|undefined} The given column if visible or `undefined` if not.
     */
    getVisibleDataColumn: function(columnIndex) {
        return this.visibleColumns.findWithNeg(function(vc) {
            return vc.column.index === columnIndex;
        });
    },

    /**
     * @memberOf Renderer.prototype
     * @returns {number} The width x coordinate of the last rendered column
     */
    getFinalVisibleColumnBoundary: function() {
        var chop = this.isLastColumnVisible() ? 2 : 1;
        var colWall = this.visibleColumns[this.visibleColumns.length - chop].right;
        return Math.min(colWall, this.getBounds().width);
    },

    /**
     * @summary Get the visibility of the row matching the provided grid row index.
     * @desc Requested row may not be visible due to being outside the bounds of the rendered grid.
     * @memberOf Renderer.prototype
     * @summary Determines visibility of a row.
     * @param {number} rowIndex - The grid row index.
     * @returns {boolean} The given row is visible.
     */
    isRowVisible: function(rowIndex) {
        return !!this.visibleRows[rowIndex];
    },

    /**
     * @summary Get the "visible row" object matching the provided grid row index.
     * @desc Requested row may not be visible due to being outside the bounds of the rendered grid.
     * @memberOf Renderer.prototype
     * @summary Find a visible row object.
     * @param {number} rowIndex - The grid row index.
     * @returns {object|undefined} The given row if visible or `undefined` if not.
     */
    getVisibleRow: function(rowIndex) {
        return this.visibleRows[rowIndex];
    },

    /**
     * @summary Get the visibility of the row matching the provided data row index.
     * @desc Requested row may not be visible due to being scrolled out of view.
     * @memberOf Renderer.prototype
     * @summary Determines visibility of a row.
     * @param {number} rowIndex - The data row index.
     * @param {dataModelAPI} [subgrid=this.behavior.subgrids.data]
     * @returns {boolean} The given row is visible.
     */
    isDataRowVisible: function(rowIndex, subgrid) {
        return !!this.getVisibleDataRow(rowIndex, subgrid);
    },

    /**
     * @summary Get the "visible row" object matching the provided data row index.
     * @desc Requested row may not be visible due to being scrolled out of view.
     * @memberOf Renderer.prototype
     * @summary Find a visible row object.
     * @param {number} rowIndex - The data row index within the given subgrid.
     * @param {dataModelAPI} [subgrid=this.behavior.subgrids.data]
     * @returns {object|undefined} The given row if visible or `undefined` if not.
     */
    getVisibleDataRow: function(rowIndex, subgrid) {
        subgrid = subgrid || this.grid.behavior.subgrids.lookup.data;
        return this.visibleRows.find(function(vr) {
            return vr.subgrid === subgrid && vr.rowIndex === rowIndex;
        });
    },

    /**
     * @memberOf Renderer.prototype
     * @summary Determines if a cell is selected.
     * @param {number} x - the x cell coordinate
     * @param {number} y - the y cell coordinate*
     * @returns {boolean} The given cell is fully visible.
     */
    isSelected: function(x, y) {
        return this.grid.isSelected(x, y);
    },

    /**
     * @memberOf Renderer.prototype
     * @desc This is the main forking of the renderering task.
     * @param {CanvasRenderingContext2D} gc
     */
    renderGrid: function(gc) {
        this.grid.deferredBehaviorChange();

        gc.beginPath();

        this.buttonCells = {};

        var rowCount = this.grid.getRowCount();
        if (rowCount !== this.lastKnowRowCount) {
            var newWidth = resetRowHeaderColumnWidth.call(this, gc, rowCount);
            if (newWidth !== this.handleColumnWidth) {
                this.needsComputeCellsBounds = true;
                this.handleColumnWidth = newWidth;
            }
            this.lastKnowRowCount = rowCount;
        }

        if (this.needsComputeCellsBounds) {
            computeCellsBounds.call(this);
            this.needsComputeCellsBounds = false;
        }

        this.gridRenderer.paintCells.call(this, gc);

        this.renderOverrides(gc);

        this.renderLastSelection(gc);

        gc.closePath();
    },

    renderLastSelection: function(gc) {
        var selections = this.grid.selectionModel.getSelections();
        if (!selections || selections.length === 0) {
            return;
        }

        var selection = this.grid.selectionModel.getLastSelection();
        if (selection.origin.x === -1) {
            // no selected area, lets exit
            return;
        }

        var vci = this.visibleColumnsByIndex,
            vri = this.visibleRowsByDataRowIndex,
            lastColumn = this.visibleColumns[this.visibleColumns.length - 1], // last column in scrollable section
            lastRow = vri[this.dataWindow.corner.y]; // last row in scrollable data section
        if (
            !lastColumn || !lastRow ||
            selection.origin.x > lastColumn.columnIndex ||
            selection.origin.y > lastRow.rowIndex
        ) {
            // selection area begins to right or below grid
            return;
        }

        var vcOrigin = vci[selection.origin.x],
            vcCorner = vci[selection.corner.x],
            vrOrigin = vri[selection.origin.y],
            vrCorner = vri[selection.corner.y];
        if (
            !(vcOrigin || vcCorner) || // entire selection scrolled out of view to left of scrollable region
            !(vrOrigin || vrCorner)    // entire selection scrolled out of view above scrollable region
        ) {
            return;
        }

        var gridProps = this.properties;
        vcOrigin = vcOrigin || this.visibleColumns[gridProps.fixedColumnCount];
        vrOrigin = vrOrigin || this.visibleRows[gridProps.fixedRowCount];
        vcCorner = vcCorner || (selection.corner.x > lastColumn.columnIndex ? lastColumn : vci[gridProps.fixedColumnCount - 1]);
        vrCorner = vrCorner || (selection.corner.y > lastRow.rowIndex ? lastRow : vri[gridProps.fixedRowCount - 1]);

        // Render the selection model around the bounds
        var config = {
            bounds: {
                x: vcOrigin.left,
                y: vrOrigin.top,
                width: vcCorner.right - vcOrigin.left,
                height: vrCorner.bottom - vrOrigin.top
            },
            selectionRegionOverlayColor: this.gridRenderer.paintCells.partial ? 'transparent' : gridProps.selectionRegionOverlayColor,
            selectionRegionOutlineColor: gridProps.selectionRegionOutlineColor
        };
        this.grid.cellRenderers.get('lastselection').paint(gc, config);
        if (this.gridRenderer.paintCells.key === 'by-cells') {
            this.gridRenderer.reset = true; // fixes GRID-490
        }
    },

    /**
     * @memberOf Renderer.prototype
     * @desc iterate the renderering overrides and manifest each
     * @param {CanvasRenderingContext2D} gc
     */
    renderOverrides: function(gc) {
        var cache = this.grid.renderOverridesCache;
        for (var key in cache) {
            if (cache.hasOwnProperty(key)) {
                var override = cache[key];
                if (override) {
                    this.renderOverride(gc, override);
                }
            }
        }
    },

    /**
     * @memberOf Renderer.prototype
     * @desc copy each overrides specified area to it's target and blank out the source area
     * @param {CanvasRenderingContext2D} gc
     * @param {OverrideObject} override - an object with details contain an area and a target context
     */
    renderOverride: function(gc, override) {
        //lets blank out the drag row
        var hdpiRatio = override.hdpiratio;
        var startX = override.startX; //hdpiRatio * edges[override.columnIndex];
        var width = override.width + 1;
        var height = override.height;
        var targetCTX = override.ctx;
        var imgData = gc.getImageData(startX, 0, Math.round(width * hdpiRatio), Math.round(height * hdpiRatio));
        targetCTX.putImageData(imgData, 0, 0);
        gc.cache.fillStyle = this.properties.backgroundColor2;
        gc.fillRect(Math.round(startX / hdpiRatio), 0, width, height);
    },

    /**
     * @memberOf Renderer.prototype
     * @returns {number} Current vertical scroll value.
     */
    getScrollTop: function() {
        return this.grid.getVScrollValue();
    },

    /**
     * @memberOf Renderer.prototype
     * @returns {number} Current horizontal scroll value.
     */
    getScrollLeft: function() {
        return this.grid.getHScrollValue();
    },

    /**
     * @memberOf Renderer.prototype
     * @returns {boolean} The last col was rendered (is visible)
     */
    isLastColumnVisible: function() {
        var lastColumnIndex = this.grid.getColumnCount() - 1;
        return !!this.visibleColumns.findWithNeg(function(vc) { return vc.columnIndex === lastColumnIndex; });
    },

    /**
     * @memberOf Renderer.prototype
     * @returns {number} The rendered column width at index
     */
    getRenderedWidth: function(index) {
        var result,
            columns = this.visibleColumns;

        if (index >= columns.length) {
            result = columns[columns.length - 1].right;
        } else {
            result = columns[index].left;
        }

        return result;
    },

    /**
     * @memberOf Renderer.prototype
     * @returns {number} The rendered row height at index
     */
    getRenderedHeight: function(index) {
        var result,
            rows = this.visibleRows;

        if (index >= rows.length) {
            var last = rows[rows.length - 1];
            result = last.bottom;
        } else {
            result = rows[index].top;
        }

        return result;
    },

    /**
     * @memberOf Renderer.prototype
     * @returns {boolean} User is currently dragging a column for reordering.
     */
    isDraggingColumn: function() {
        return this.grid.isDraggingColumn();
    },

    /**
     * @memberOf Renderer.prototype
     * @returns {number} The row to go to for a page up.
     */
    getPageUpRow: function() {
        var grid = this.grid,
            scrollHeight = this.getVisibleScrollHeight(),
            top = this.dataWindow.origin.y - this.properties.fixedRowCount - 1,
            scanHeight = 0;
        while (scanHeight < scrollHeight && top >= 0) {
            scanHeight += grid.getRowHeight(top);
            top--;
        }
        return top + 1;
    },

    /**
     * @memberOf Renderer.prototype
     * @returns {number} The row to goto for a page down.
     */
    getPageDownRow: function() {
        return this.dataWindow.corner.y - this.properties.fixedRowCount + 1;
    },

    renderErrorCell: function(err, gc, vc, vr) {
        var message = err && (err.message || err) || 'Unknown error.',
            bounds = { x: vc.left, y: vr.top, width: vc.width, height: vr.height },
            config = { bounds: bounds };

        console.error(message);

        gc.cache.save(); // define clipping region
        gc.beginPath();
        gc.rect(bounds.x, bounds.y, bounds.width, bounds.height);
        gc.clip();

        this.grid.cellRenderers.get('errorcell').paint(gc, config, message);

        gc.cache.restore(); // discard clipping region
    },

    /**
     * @memberOf Renderer.prototype
     * @desc We opted to not paint borders for each cell as that was extremely expensive. Instead we draw grid lines here.
     * @param {CanvasRenderingContext2D} gc
     */
    paintGridlines: function(gc) {
        var visibleColumns = this.visibleColumns, C = visibleColumns.length,
            visibleRows = this.visibleRows, R = visibleRows.length;

        if (C && R) {
            var gridProps = this.properties,
                viewWidth = visibleColumns[C - 1].right,
                viewHeight = visibleRows[R - 1].bottom;

            if (gridProps.gridLinesV) {
                gc.cache.fillStyle = gridProps.gridLinesVColor;
                for (var right, vc = visibleColumns[0], c = 1; c < C; c++) {
                    right = vc.right;
                    vc = visibleColumns[c];
                    if (!vc.gap) {
                        gc.fillRect(right, 0, gridProps.gridLinesVWidth, viewHeight);
                    }
                }
            }

            if (gridProps.gridLinesH) {
                gc.cache.fillStyle = gridProps.gridLinesHColor;
                for (var bottom, vr = visibleRows[0], r = 1; r < R; r++) {
                    bottom = vr.bottom;
                    vr = visibleRows[r];
                    if (!vr.gap) {
                        gc.fillRect(0, bottom, viewWidth, gridProps.gridLinesHWidth);
                    }
                }
            }

            var edgeWidth;
            var gap = visibleRows.gap;
            if (gap) {
                gc.cache.fillStyle = gridProps.fixedLinesHColor || gridProps.gridLinesHColor;
                edgeWidth = gridProps.fixedLinesHEdge;
                if (edgeWidth) {
                    gc.fillRect(0, gap.top, viewWidth, edgeWidth);
                    gc.fillRect(0, gap.bottom - edgeWidth, viewWidth, edgeWidth);
                } else {
                    gc.fillRect(0, gap.top, viewWidth, gap.bottom - gap.top);
                }
            }

            gap = visibleColumns.gap;
            if (gap) {
                gc.cache.fillStyle = gridProps.fixedLinesVColor || gridProps.gridLinesVColor;
                edgeWidth = gridProps.fixedLinesVEdge;
                if (edgeWidth) {
                    gc.fillRect(gap.left, 0, edgeWidth, viewHeight);
                    gc.fillRect(gap.right - edgeWidth, 0, edgeWidth, viewHeight);
                } else {
                    gc.fillRect(gap.left, 0, gap.right - gap.left, viewHeight);
                }
            }
        }
    },

    /**
     * @memberOf Renderer.prototype
     * @param {CanvasRenderingContext2D} gc
     * @param x
     * @param y
     */
    paintCell: function(gc, x, y) {
        gc.moveTo(0, 0);

        var c = this.visibleColumns[x].index, // todo refac
            r = this.visibleRows[y].index;

        if (c) { //something is being viewed at at the moment (otherwise returns undefined)
            this._paintCell(gc, c, r);
        }
    },

    /**
     * @summary Render a single cell.
     * @param {CanvasRenderingContext2D} gc
     * @param {CellEvent} cellEvent
     * @param {string} [prefillColor] If omitted, this is a partial renderer; all other renderers must provide this.
     * @returns {number} Preferred width of renndered cell.
     * @private
     * @memberOf Renderer
     */
    _paintCell: function(gc, cellEvent, prefillColor) {
        var grid = this.grid,
            selectionModel = grid.selectionModel,
            behavior = grid.behavior,

            isHandleColumn = cellEvent.isHandleColumn,
            isTreeColumn = cellEvent.isTreeColumn,
            isColumnSelected = cellEvent.isColumnSelected,

            isDataRow = cellEvent.isDataRow,
            isRowSelected = cellEvent.isRowSelected,
            isCellSelected = cellEvent.isCellSelected,

            isHeaderRow = cellEvent.isHeaderRow,
            isFilterRow = cellEvent.isFilterRow,

            isRowHandleOrHierarchyColumn = isHandleColumn || isTreeColumn,
            isUserDataArea = !isRowHandleOrHierarchyColumn && isDataRow,

            config = this.assignProps(cellEvent),

            x = (config.gridCell = cellEvent.gridCell).x,
            r = (config.dataCell = cellEvent.dataCell).y,

            format,
            isSelected;

        if (isHandleColumn) {
            isSelected = isRowSelected || selectionModel.isCellSelectedInRow(r);
            config.halign = 'right';
        } else if (isTreeColumn) {
            isSelected = isRowSelected || selectionModel.isCellSelectedInRow(r);
            config.halign = 'left';
        } else if (isDataRow) {
            isSelected = isCellSelected || isRowSelected || isColumnSelected;
            format = config.format;
        } else {
            format = cellEvent.subgrid.format || config.format; // subgrid format can override column format
            if (isFilterRow) {
                isSelected = false;
            } else if (isColumnSelected) {
                isSelected = true;
            } else {
                isSelected = selectionModel.isCellSelectedInColumn(x); // header or summary or other non-meta
            }
        }

        // Set cell contents:
        // * For all cells: set `config.value` (writable property)
        // * For cells outside of row handle column: also set `config.dataRow` for use by valOrFunc
        if (!isHandleColumn) {
            //Including hierarchyColumn
            config.dataRow = cellEvent.dataRow;
            config.value = cellEvent.value;
        } else {
            if (isDataRow) {
                // row handle for a data row
                if (config.rowHeaderNumbers) {
                    config.value = r + 1; // row number is 1-based
                }
            } else if (isHeaderRow) {
                // row handle for header row: gets "master" checkbox
                config.allRowsSelected = selectionModel.areAllRowsSelected();
            }
        }

        config.isSelected = isSelected;
        config.isDataColumn = !isRowHandleOrHierarchyColumn;
        config.isHandleColumn = isHandleColumn;
        config.isTreeColumn = isTreeColumn;
        config.isDataRow = isDataRow;
        config.isHeaderRow = isHeaderRow;
        config.isFilterRow = isFilterRow;
        config.isUserDataArea = isUserDataArea;
        config.isColumnHovered = cellEvent.isColumnHovered;
        config.isRowHovered = cellEvent.isRowHovered;
        config.isCellHovered = cellEvent.isCellHovered;
        config.bounds = cellEvent.bounds;
        config.isCellSelected = isCellSelected;
        config.isRowSelected = isRowSelected;
        config.isColumnSelected = isColumnSelected;
        config.isInCurrentSelectionRectangle = selectionModel.isInCurrentSelectionRectangle(x, r);
        config.prefillColor = prefillColor;

        if (grid.mouseDownState) {
            config.mouseDown = grid.mouseDownState.gridCell.equals(cellEvent.gridCell);
        }

        // compute value if a calculator
        if (isUserDataArea && !(config.value && config.value.constructor === Array)) { // fastest array determination
            config.value = config.exec(config.value);
        }

        // This call's dataModel.getCell which developer can override to:
        // * mutate the (writable) properties of `config`
        // * mutate cell renderer choice (instance of which is returned)
        var cellRenderer = behavior.dataModel.getCell(config, config.renderer);

        // Overwrite possibly mutated cell properties, if requested to do so by `getCell` override
        if (cellEvent.cellOwnProperties && config.reapplyCellProperties) {
            Object.assign(config, cellEvent.cellOwnProperties);
        }

        behavior.cellPropertiesPrePaintNotification(config);

        //allow the renderer to identify itself if it's a button
        config.buttonCells = this.buttonCells;

        config.formatValue = grid.getFormatter(format);

        // Following supports partial render>
        config.snapshot = cellEvent.snapshot;
        config.minWidth = cellEvent.minWidth; // in case `paint` aborts before setting `minWidth`

        // Render the cell
        cellRenderer.paint(gc, config);

        // Following supports partial render:
        cellEvent.snapshot = config.snapshot;
        cellEvent.minWidth = config.minWidth;

        return config.minWidth;
    },

    /**
     * Overridable for alternative or faster logic.
     * @param cellEvent
     */
    assignProps: function(cellEvent) {
        var i, base, assignments,
            propLayers = cellEvent.columnProperties.propClassLayers;

        if (propLayers[0] !== 1) {
            i = 0; // all prop layers
            base = this.grid.properties;
        } else {
            i = 1; // skip column prop layer
            base = cellEvent.columnProperties; // because column has grid properties as prototype
        }

        for (assignments = [Object.create(base)]; i < propLayers.length; ++i) {
            assignments.push(propClassGet[propLayers[i]](cellEvent));
        }

        return Object.assign.apply(Object, assignments);
    },

    /**
     * @param {number|CellEvent} colIndexOrCellEvent - This is the "data" x coordinate.
     * @param {number} [rowIndex] - This is the "data" y coordinate. Omit if `colIndexOrCellEvent` is a `CellEvent`.
     * @param {dataModelAPI} [dataModel=this.grid.behavior.dataModel] Omit if `colIndexOrCellEvent` is a `CellEvent`.
     * @returns {CellEvent} The matching `CellEvent` object from the renderer's pool. Returns `undefined` if the requested cell is not currently visible (due to being scrolled out of view).
     */
    findCell: function(colIndexOrCellEvent, rowIndex, dataModel) {
        var colIndex, cellEvent,
            pool = this.cellEventPool;

        if (typeof colIndexOrCellEvent === 'object') {
            // colIndexOrCellEvent is a cell event object
            dataModel = rowIndex;
            rowIndex = colIndexOrCellEvent.visibleRow.rowIndex;
            colIndex = colIndexOrCellEvent.column.index;
        } else {
            colIndex = colIndexOrCellEvent;
        }

        dataModel = dataModel || this.grid.behavior.dataModel;

        for (var p = 0, len = this.visibleColumns.length * this.visibleRows.length; p < len; ++p) {
            cellEvent = pool[p];
            if (
                cellEvent.subgrid === dataModel &&
                cellEvent.column.index === colIndex &&
                cellEvent.visibleRow.rowIndex === rowIndex
            ) {
                return cellEvent;
            }
        }
    },

    /**
     * Resets the cell properties cache in the matching `CellEvent` object from the renderer's pool. This will insure that a new cell properties object will be known to the renderer. (Normally, the cache is not reset until the pool is updated by the next call to {@link Renderer#computeCellBounds}).
     * @param {number|CellEvent} xOrCellEvent
     * @param {number} [y]
     * @param {dataModelAPI} [dataModel=this.grid.behavior.dataModel]
     * @returns {CellEvent} The matching `CellEvent` object.
     */
    resetCellPropertiesCache: function(xOrCellEvent, y, dataModel) {
        var cellEvent = this.findCell.apply(this, arguments);
        if (cellEvent) { cellEvent._cellOwnProperties = undefined; }
        return cellEvent;
    },

    resetAllCellPropertiesCaches: function() {
        this.cellEventPool.forEach(function(cellEvent) {
            cellEvent._cellOwnProperties = undefined;
        });
    },

    isViewableButton: function(c, r) {
        var key = c + ',' + r;
        return this.buttonCells[key] === true;
    },

    getBounds: function() {
        return this.bounds;
    },

    setBounds: function(bounds) {
        return (this.bounds = bounds);
    },

    setInfo: function(message) {
        var width;
        if (this.visibleColumns.length) {
            width = this.visibleColumns[this.visibleColumns.length - 1].right;
        }
        this.grid.canvas.setInfo(message, width);
    }
});

/**
 * This function creates several data structures:
 * * {@link Renderer#visibleColumns}
 * * {@link Renderer#visibleRows}
 *
 * Original comment:
 * "this function computes the grid coordinates used for extremely fast iteration over
 * painting the grid cells. this function is very fast, for thousand rows X 100 columns
 * on a modest machine taking usually 0ms and no more that 3 ms."
 *
 * @this {Renderer}
 */
function computeCellsBounds() {
    //var startTime = Date.now();

    var scrollTop = this.getScrollTop(),
        scrollLeft = this.getScrollLeft(),

        fixedColumnCount = this.grid.getFixedColumnCount(),
        fixedRowCount = this.grid.getFixedRowCount(),

        bounds = this.getBounds(),
        grid = this.grid,
        behavior = grid.behavior,
        noTreeColumn = !behavior.hasTreeColumn(),
        editorCellEvent = grid.cellEditor && grid.cellEditor.event,

        vcEd, xEd,
        vrEd, yEd,
        sgEd, isSubgridEd,

        insertionBoundsCursor = 0,
        previousInsertionBoundsCursorValue = 0,

        gridProps = grid.properties,
        lineWidthV = gridProps.gridLinesVWidth,
        lineWidthH = gridProps.gridLinesHWidth,
        fixedWidthV = gridProps.fixedLinesVWidth || gridProps.gridLinesVWidth,
        fixedWidthH = gridProps.fixedLinesHWidth || gridProps.gridLinesHWidth,
        hasFixedColumnGap = fixedWidthV && fixedColumnCount,
        hasFixedRowGap = fixedWidthH && fixedRowCount,

        start = 0,
        numOfInternalCols = 0,
        x, X, // horizontal pixel loop index and limit
        y, Y, // vertical pixel loop index and limit
        c, C, // column loop index and limit
        g, G, // subgrid loop index and limit
        r, R, // row loop index and limit
        subrows, // rows in subgrid g
        base, // sum of rows for all subgrids so far
        subgrids = behavior.subgrids,
        subgrid,
        rowIndex,
        scrollableSubgrid,
        footerHeight,
        vx, vy,
        vr, vc,
        width, height,
        firstVX, lastVX,
        firstVY, lastVY,
        topR,
        gap,
        left, widthSpaced, heightSpaced; // adjusted for cell spacing

    if (editorCellEvent) {
        xEd = editorCellEvent.gridCell.x;
        yEd = editorCellEvent.dataCell.y;
        sgEd = editorCellEvent.subgrid;
    }

    if (noTreeColumn) {
        this.visibleColumns[behavior.treeColumnIndex] = undefined;
    } else {
        start = Math.min(start, behavior.treeColumnIndex);
        numOfInternalCols += 1;
    }

    if (gridProps.showRowNumbers) {
        start = Math.min(start, behavior.rowColumnIndex);
        numOfInternalCols += 1;
    }

    this.scrollHeight = 0;

    this.visibleColumns.length = 0;
    this.visibleColumns.gap = undefined;

    this.visibleRows.length = 0;
    this.visibleRows.gap = undefined;

    this.visibleColumnsByIndex = []; // array because number of columns will always be reasonable
    this.visibleRowsByDataRowIndex = {}; // hash because keyed by (fixed and) scrolled row indexes

    this.insertionBounds = [];

    for (
        x = 0, c = start, C = grid.getColumnCount(), X = bounds.width || grid.canvas.width;
        c < C && x <= X;
        c++
    ) {
        if (noTreeColumn && c === behavior.treeColumnIndex) {
            continue;
        }

        vx = c;
        if (c >= fixedColumnCount) {
            lastVX = vx += scrollLeft;
            if (firstVX === undefined) {
                firstVX = lastVX;
            }
        }
        if (vx >= C) {
            break; // scrolled beyond last column
        }

        width = Math.ceil(behavior.getColumnWidth(vx));

        if (x) {
            if ((gap = hasFixedColumnGap && c === fixedColumnCount)) {
                x += fixedWidthV - lineWidthV;
                this.visibleColumns.gap = {
                    left: vc.right,
                    right: undefined
                };
            }
            left = x + lineWidthV;
            widthSpaced = width - lineWidthV;
        } else {
            left = x;
            widthSpaced = width;
        }
        this.visibleColumns[c] = this.visibleColumnsByIndex[vx] = vc = {
            index: c,
            columnIndex: vx,
            column: behavior.getActiveColumn(vx),
            gap: gap,
            left: left,
            width: widthSpaced,
            right: left + widthSpaced
        };

        if (gap) {
            this.visibleColumns.gap.right = vc.left;
        }

        if (xEd === vx) {
            vcEd = vc;
        }

        x += width;

        insertionBoundsCursor += Math.round(width / 2) + previousInsertionBoundsCursorValue;
        this.insertionBounds.push(insertionBoundsCursor);
        previousInsertionBoundsCursorValue = Math.round(width / 2);
    }

    // get height of total number of rows in all subgrids following the data subgrid
    footerHeight = gridProps.defaultRowHeight *
        subgrids.reduce(function(rows, subgrid) {
            if (scrollableSubgrid) {
                rows += subgrid.getRowCount();
            } else {
                scrollableSubgrid = subgrid.isData;
            }
            return rows;
        }, 0);

    for (
        base = r = g = y = 0, G = subgrids.length, Y = bounds.height - footerHeight;
        g < G;
        g++, base += subrows
    ) {
        subgrid = subgrids[g];
        subrows = subgrid.getRowCount();
        scrollableSubgrid = subgrid.isData;
        isSubgridEd = (sgEd === subgrid);
        topR = r;

        // For each row of each subgrid...
        for (R = r + subrows; r < R && y < Y; r++) {
            vy = r;
            if (scrollableSubgrid) {
                if ((gap = hasFixedRowGap && r === fixedRowCount)) {
                    y += fixedWidthH - lineWidthH;
                    this.visibleRows.gap = {
                        top: vr.bottom,
                        bottom: undefined
                    };
                }
                if (r >= fixedRowCount) {
                    vy += scrollTop;
                    lastVY = vy - base;
                    if (firstVY === undefined) {
                        firstVY = lastVY;
                    }
                    if (vy >= R) {
                        break; // scrolled beyond last row
                    }
                }
            }

            rowIndex = vy - base;
            height = behavior.getRowHeight(rowIndex, subgrid);

            heightSpaced = height - lineWidthH;
            this.visibleRows[r] = vr = {
                index: r,
                subgrid: subgrid,
                gap: gap,
                rowIndex: rowIndex,
                top: y,
                height: heightSpaced,
                bottom: y + heightSpaced
            };

            if (gap) {
                this.visibleRows.gap.bottom = vr.top;
            }

            if (scrollableSubgrid) {
                this.visibleRowsByDataRowIndex[vy - base] = vr;
            }

            if (isSubgridEd && yEd === rowIndex) {
                vrEd = vr;
            }

            y += height;
        }

        if (scrollableSubgrid) {
            subrows = r - topR;
            Y += footerHeight;
        }
    }

    if (editorCellEvent) {
        editorCellEvent.visibleColumn = vcEd;
        editorCellEvent.visibleRow = vrEd;
        editorCellEvent.gridCell.y = vrEd && vrEd.index;
        editorCellEvent._bounds = null;
    }

    this.viewHeight = Y;

    this.dataWindow = this.grid.newRectangle(firstVX, firstVY, lastVX - firstVX, lastVY - firstVY);

    // Resize CellEvent pool
    var pool = this.cellEventPool,
        previousLength = pool.length,
        P = (this.visibleColumns.length + numOfInternalCols) * this.visibleRows.length;

    if (P > previousLength) {
        pool.length = P; // grow pool to accommodate more cells
    }
    for (var p = previousLength; p < P; p++) {
        pool[p] = new behavior.CellEvent; // instantiate new members
    }

    this.resetAllGridRenderers();
}

/**
 * @summary Resize the handle column.
 * @desc Handle column width is sum of:
 * * Width of text the maximum row number, if visible, based on handle column's current font
 * * Width of checkbox, if visible
 * * Some padding
 *
 * @this {Renderer}
 * @param gc
 * @param rowCount
 */
function resetRowHeaderColumnWidth(gc, rowCount) {
    var columnProperties = this.grid.behavior.getColumnProperties(this.grid.behavior.rowColumnIndex),
        gridProps = this.grid.properties,
        width = 2 * columnProperties.cellPadding;

    // Checking images.checked also supports a legacy feature in which checkbox could be hidden by undefining the image.
    if (gridProps.rowHeaderCheckboxes && images.checked) {
        width += images.checked.width;
    }

    if (gridProps.rowHeaderNumbers) {
        var cellProperties = columnProperties.rowHeader;
        gc.cache.font = cellProperties.foregroundSelectionFont.indexOf('bold ') >= 0
            ? cellProperties.foregroundSelectionFont
            : cellProperties.font;

        width += gc.getTextWidth(rowCount);
    }

    columnProperties.preferredWidth = columnProperties.width = width;
}

function registerGridRenderer(paintCellsFunction) {
    if (paintCellsFunctions.indexOf(paintCellsFunction) < 0) {
        paintCellsFunctions.push(paintCellsFunction);
    }
}

registerGridRenderer(require('./by-cells'));
registerGridRenderer(require('./by-columns'));
registerGridRenderer(require('./by-columns-discrete'));
registerGridRenderer(require('./by-columns-and-rows'));
registerGridRenderer(require('./by-rows'));

Renderer.registerGridRenderer = registerGridRenderer;

module.exports = Renderer;

},{"../../images":11,"../Base":25,"./by-cells":92,"./by-columns":95,"./by-columns-and-rows":93,"./by-columns-discrete":94,"./by-rows":96}],98:[function(require,module,exports){
'use strict';

module.exports = [
    { ID: 10, parentID: null, State: 'France',        Latitude: 46.1274793, Longitude: -2.288454 },
    { ID: 11, parentID:   10, State: 'Paris',         Latitude: 48.8588376, Longitude: 2.2773459 },
    { ID: 20, parentID: null, State: 'USA',           Latitude: 36.2161472, Longitude: -113.6866279 },
    { ID:  1, parentID:   20, State: 'New York',      Latitude: 40.7055651, Longitude: -74.118086 },
    { ID:  2, parentID:    1, State: 'Albany',        Latitude: 42.6681345, Longitude: -73.846419 },
    { ID:  3, parentID:    1, State: 'Syracuse',      Latitude: 43.0352286, Longitude: -76.1742994 },
    { ID:  4, parentID:   20, State: 'California',    Latitude: 37.1870791, Longitude: -123.762638 },
    { ID:  5, parentID:    4, State: 'Berkeley',      Latitude: 37.8759458, Longitude: -122.2981316 },
    { ID:  6, parentID:    4, State: 'Laguna',        Latitude: 33.5482634, Longitude: -117.8447927 },
    { ID:  7, parentID:    4, State: 'Monterey',      Latitude: 36.5943628, Longitude: -121.9025183 },
    { ID:  8, parentID:   20, State: 'Massachusetts', Latitude: 42.6369691, Longitude: -71.3618803 },
    { ID:  9, parentID:    8, State: 'Lowell',        Latitude: 42.6369691, Longitude: -71.3618803 },
];

},{}],99:[function(require,module,exports){
'use strict';

var Hypergrid = require('fin-hypergrid'),
    DataSourceLocal = require('datasaur-local'),
    DataSourceSearchable = require('datasaur-searchable'),
    DataSourceTreeView = require('datasaur-tree-view'),
    treeViewPlugin = require('fin-hypergrid-tree-view-plugin'),
    data = require('./data-sorted');


window.onload = function() {

    // Build the data source
    var local = new DataSourceLocal,
        searchableByID = new DataSourceSearchable(local, { primaryKey: 'ID' }),
        searchableByParentID = new DataSourceSearchable(searchableByID, { primaryKey: 'parentID' }),
        dataSource = new DataSourceTreeView(searchableByParentID);

    var grid = new Hypergrid({
            Behavior: require('fin-hypergrid/src/behaviors/JSON'),
            dataSource: dataSource
        }),
        treeViewOptions = { treeColumn: 'State' },
        treeViewPluginSpec = [treeViewPlugin, treeViewOptions],
        plugins = [treeViewPluginSpec];

    grid.installPlugins(plugins);

    grid.setData(data);

    grid.properties.renderFalsy = true;

    grid.behavior.setColumnProperties(grid.behavior.columnEnum.STATE, {
        halign: 'left'
    });

    window.grid = grid;

    var checkbox = document.querySelector('input[type=checkbox]');

    checkbox.onclick = function() {
        grid.plugins.treeView.join = this.checked;
    };

};


},{"./data-sorted":98,"datasaur-local":5,"datasaur-searchable":6,"datasaur-tree-view":7,"fin-hypergrid":12,"fin-hypergrid-tree-view-plugin":100,"fin-hypergrid/src/behaviors/JSON":34}],100:[function(require,module,exports){
/* eslint-env browser */

'use strict';

/**
 * @classdesc This is a simple helper class to set up the tree-view data source in the context of a hypergrid.
 *
 * It includes methods to:
 * * Build a new pipeline with `DataSourceTreeview` and appropriate sorter and filter.
 * * Perform the self-join and rebuild the index to turn the tree-view on or off, optionally hiding the ID columns.
 *
 * @see {@link http://openfin.github.io/hyper-analytics/DataSourceTreeview.html#setRelation}
 *
 * @param {Hypergrid} grid
 * @param {object} [options] - In addition to the following, also contains options for `DataSourceTreeView`'s `setRelation` method (|see}) by {@link TreeView#setRelation|this.setRelation}.
 * @param {number|string} [options.idColumn='ID'] - See `DataSourceTreeview.prototype.setRelation`.
 * @param {number|string} [options.parentIdColumn='parentID'] - See `DataSourceTreeview.prototype.setRelation`.
 * @param {number|string} [options.treeColumn='name'] - See `DataSourceTreeview.prototype.setRelation`.
 * @param {number|string} [options.groupColumn=dataSource.treeColumn.name] - See `DataSourceTreeview.prototype.setRelation`.
 * @constructor
 */
function TreeView(grid, options) {
    this.options = options || {};
    this.grid = grid;
    grid.properties.showTreeColumn = false;
}

TreeView.prototype = {

    constructor: TreeView,

    name: 'TreeView',

    /**
     * @summary Build/unbuild the tree view.
     * @desc "Joins" the table to itself through the ID and parent ID columns using the options given to the constructor (see above).
     *
     * Reconfigures the data model's data pipeline for tree view join; restores it when unjoined.
     *
     * Also saves and restores some grid properties:
     * * Tree column is made non-editable.
     * * Tree column is made non-selectable so clicking drill-down controls doesn't select the cell.
     * * Row are made selectable by clicking in row handles only so clicking drill-down controls doesn't select the row.
     * @param {boolean} join - If truthy, turn tree-view **ON**. If falsy (or omitted), turn it **OFF**.
     */
    set join(enable) {
        var grid = this.grid,
            behavior = grid.behavior,
            dataSource = behavior.dataModel.dataSource;

        if (this.options) {
            // set the various column index options in the data source
            var dataSource = grid.behavior.dataModel.dataSource;
            dataSource.idColumn = this.options.idColumn;
            dataSource.parentIdColumn = this.options.parentIdColumn;
            dataSource.treeColumn = this.options.treeColumn;
            dataSource.groupColumn = this.options.groupColumn;
            this.options = undefined;
        }

        var columnProps = behavior.getColumnProperties(dataSource.treeColumn.index),
            state = grid.properties;

        dataSource.join = enable;
        behavior.reindex();

        if (enable) {
            if (!this.was) {
                // Save the render props for later restoration
                this.was = {
                    editableWas: columnProps.editable,
                    cellSelectionWas: columnProps.cellSelection,
                    checkboxOnlyRowSelectionsWas: state.checkboxOnlyRowSelections
                };

                // Make the tree column uneditable: Save the current value of the tree column's editable property and set it to false.
                columnProps.editable = false;

                // Make the three column unselectable
                columnProps.cellSelection = false;

                // Set to true so drill-down clicks don't select the row they are in
                state.checkboxOnlyRowSelections = true;
            }
        } else {
            // restore the saved render props
            if (this.was) {
                columnProps.editable = this.was.editable;
                columnProps.cellSelection = this.was.cellSelection;
                state.checkboxOnlyRowSelections = this.was.checkboxOnlyRowSelections;
                delete this.was;
            }
        }

        grid.selectionModel.clear();
        grid.clearMouseDown();
    },
    get join() {
        return this.grid.behavior.dataModel.dataSource.join;
    },

    /**
     * @summary Delete a row and it's children.
     * @desc _Requires that the row-by-id API is installed._
     *
     * Alternatively, you can reassign the children to another row (see `adoptiveParentID` below).
     *
     * After you're done with all your row manipulations, you must call:
     * ```javascript
     * grid.behavior.reindex();
     * grid.behaviorShapeChanged();
     * grid.repaint(); // call this eventually
     * ```
     *
     * @param {number} ID - ID of the row to delete.
     * @param {object} [options]
     * @param {null|number} [options.adoptiveParentID] - ID of the row to reassign the orphaned children to.
     * If null, reassigns to top-level.
     * If omitted (or `undefined`), the orphans are recursively deleted.
     * @param {boolean} [options.keepParent] - Just delete (or reassign) children but keep the parent.
     * @param {boolean} [options.keepDrillDown] - Keep drill down control on the kept parent.
     * @returns {number} Total rows deleted.
     */
    deleteRow: function (ID, options) {
        options = options || {};

        var method, dataRow,
            adoptiveParentID = options.adoptiveParentID,
            adopting = typeof adoptiveParentID === 'number' || adoptiveParentID === null,
            deletions = 0,
            dataModel = this.grid.behavior.dataModel,
            dataSource = dataModel.dataSource,

            // getIdColumn rather than idColumn in case setRelation not called yet:
            idColumnName = dataSource.idColumn.name,
            parentIdColumnName = dataSource.parentIdColumn.name;

        if (adoptiveParentID && !dataModel.source.findRow(idColumnName, adoptiveParentID)) {
            throw 'Adoptive parent row not found.';
        }

        method = options.keepParent ? dataModel.getRowById : dataModel.deleteRowById;
        dataRow = method.call(dataModel, idColumnName, ID);
        if (dataRow) {
            if (!keepParent) {
                deletions++;
            } else if (!options.keepDrillDown) {
                delete dataRow.__EXPANDED;
            }

            while ((dataRow = dataSource.findRow(parentIdColumnName, ID))) {
                if (adopting) {
                    dataRow[parentIdColumnName] = adoptiveParentID;
                } else {
                    deletions += this.deleteRow(dataRow[idColumnName]);
                }
            }
        }

        return deletions;
    }

};

module.exports = TreeView;

},{}]},{},[99]);
