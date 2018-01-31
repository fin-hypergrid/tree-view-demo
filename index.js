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

