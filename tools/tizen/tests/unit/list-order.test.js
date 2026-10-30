'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var load = require('./sandbox');
var files = ['profile-store.js', 'move-mode.js', 'list-order.js', 'hidden-categories.js'];
var rows = function (ids) { return ids.map(function (id) { return { category_id: id, category_name: id }; }); };
var ids = function (list) { return Array.from(list, function (row) { return row.category_id; }).join(','); };

test('#87 order survives reload/refresh per profile, source and section, with new categories appended and removed ones forgotten', function () {
    var env = load(files), g = env.globals, key = g.ListOrder.categoryKey;
    g.ListOrder.save('s1', 'categories:live', rows(['3', '', '1', '2']), key);
    g.ListOrder.save('s1', 'categories:movies', rows(['2', '1']), key);
    assert.equal(ids(g.ListOrder.apply('s1', 'categories:live', rows(['', '1', '2', '4']), key)), ',1,2,4');
    var again = load(files, env.stored).globals;
    assert.equal(ids(again.ListOrder.apply('s1', 'categories:live', rows(['', '4', '3', '2', '1']), key)), ',1,2,4,3');
    assert.equal(ids(g.ListOrder.apply('s2', 'categories:live', rows(['1', '2']), key)), '1,2');
    assert.equal(ids(g.ListOrder.apply('s1', 'categories:movies', rows(['1', '2']), key)), '2,1');
    g.ProfileStore.setActive(g.ProfileStore.add('Other').id);
    assert.equal(g.ListOrder.changed('s1', 'categories:live'), false);
    g.ProfileStore.setActive('default');
    g.ListOrder.reset('s1', 'categories:live');
    assert.equal(ids(g.ListOrder.apply('s1', 'categories:live', rows(['1', '2', '3']), key)), '1,2,3');
    assert.equal(g.ListOrder.changed('s1', 'categories:live'), false);
});

test('hidden categories retain their slots when visible categories move and when shown again', function () {
    var g = load(files).globals, key = g.ListOrder.categoryKey;
    var all = rows(['1', '2', '3', '4']);
    g.HiddenCategories.hide('s1', 'live', '2');
    var visible = g.HiddenCategories.visible('s1', 'live', all);
    var changed = g.ListOrder.replace(all, g.MoveMode.top(visible, 2), key);
    g.ListOrder.save('s1', 'categories:live', changed, key);
    var ordered = g.ListOrder.apply('s1', 'categories:live', all, key);
    assert.equal(ids(g.HiddenCategories.visible('s1', 'live', ordered)), '4,1,3');
    g.HiddenCategories.showAll('s1', 'live');
    assert.equal(ids(g.HiddenCategories.visible('s1', 'live', ordered)), '4,2,1,3');
});

test('late app rows retain their saved positions and a newly created own group starts after the library rows of an existing category order', function () {
    var g = load(files).globals, key = g.ListOrder.categoryKey;
    g.ListOrder.save('s1', 'categories:movies', rows(['1', '__added', '', '2']), key);
    assert.equal(ids(g.ListOrder.apply('s1', 'categories:movies', rows(['', '1', '2']), key)), '1,,2');
    assert.equal(ids(g.ListOrder.apply('s1', 'categories:movies', rows(['', '__added', '1', '2']), key)), '1,__added,,2');
    g.ListOrder.save('s1', 'categories:live', rows(['2', '1', '']), key);
    g.ListOrder.addGroup('s1', 'categories:live', '__group_new');
    assert.equal(ids(g.ListOrder.apply('s1', 'categories:live', rows(['__group_new', '', '1', '2']), key)), '__group_new,2,1,');
    g.ListOrder.save('s1', 'categories:live', rows(['__fav', '2', '__recent', '1', '']), key);
    assert.equal(ids(g.ListOrder.apply('s1', 'categories:live', rows(['__fav', '__recent', '__recentch', '', '1', '2']), key)), '__recentch,__fav,2,__recent,1,');
    g.ListOrder.addGroup('s1', 'categories:live', '__group_b');
    assert.equal(ids(g.ListOrder.apply('s1', 'categories:live', rows(['__recentch', '__fav', '__recent', '__group_b', '', '1', '2']), key)), '__recentch,__fav,__group_b,2,__recent,1,');
});
