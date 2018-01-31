# tree-view-demo

This is a demo of the [`fin-hypergrid-tree-view-plugin`](https://github.com/fin-hypergrid/tree-view-plugin) which shows hierarchical data on a [self-joined table](#self-joined-tables).

## Using the plugin

To use the `fin-hypergrid-tree-view-plugin` plug-in, the following requirements must be met:

* The data has:
   * A primary key
   * A foreign key
* The data source implements setters and getters for:
   * `idColumn` (name or column index) - The column containing the primary key. Defaults to `'ID'`.
   * `parentIdColumn` (name or column index) - The column containing the foreign key Defaults to `'parentID'`.
   * `treeColumn` (name or column index) - The column displaying the decorations described below Defaults to `'name'`.
   * `groupColumn` (name or column index) - The column to be group-sorted. Defaults to `treeColumn`.
   * `join` (boolean) - Whether or not the table is in the joined state.
* When in the joined state (`dataSource.join = true`), the data source decorates values in the "tree" column with:
   * An indent to reflect the degree of descent.
   * A drill-down control string for rows with children. Initially, all controls are set to _closed_ and the child rows are hidden. Controls are sticky and remember their settings while hidden.

The `datasaur-tree-view` data source implements the above, but is dependent on a `findRowIndexByID` and `findRowIndexByParentID` methods which it does not implement, as well as an underlying data source. An example data stack might be:

Data Source | Description
---|---
`datasaur-tree-view` | Implements the above setters and getters
`datasaur-searchable` | Implements `findRowIndexByID`
`datasaur-searchable` | Implements `findRowIndexByParentID`
`datasaur-local` | The underlying data source that implements `getValue`, _etc._

Typically, the ID and parentID columns are hidden from view.

## Self-joined tables

A table with a [self-join](https://en.wikipedia.org/wiki/Join_(SQL)#Self-join) is a table with a [foreign key](https://en.wikipedia.org/wiki/Foreign_key) (FK) that references the table's own [primary key](https://en.wikipedia.org/wiki/Primary_key) (PK) as its "parent" row.

A classic example of a self-joined table is a table representing a hierarchical file system, wherein each row represents a file in the file system. For example, consider the following typical file structure for a web site:

* /index.html
* /stylesheets/styles.css
* /src/index.js
* /src/data/js

If the above listing can be captured in a table like the following:

ID|name|parentID
---|---|---
1|NULL|index.html
2|NULL|stylesheets
3|NULL|src
4|3|index.js
5|3|data.js
6|2|styles.css

`parentID` refers to the folder inside which this file (or folder) lives. The Files and folders in the root have no parent folder so their `parentID` columns are `NULL`.

(In this simple example any file can be a folder. More typically, rows would be tagged with an additional boolean column as either folders or files proper and `parentID` would be [constrained](https://en.wikipedia.org/wiki/Relational_database#Constraints) to point only to rows tagged as folders.)