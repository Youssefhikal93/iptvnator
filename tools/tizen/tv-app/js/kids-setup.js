// Making and changing kids profiles (#62): Add profile with its Kids switch,
// the same switch when a profile is renamed, and "What can <name> watch?".
// A kids profile is guarded by a grown-up profile with a PIN; adding one from
// a grown-up profile without a PIN asks for a new PIN first.
window.KidsSetup = (function () {
    'use strict';

    function sources() {
        try {
            return Sources.all();
        } catch (e) {
            return [];
        }
    }

    function listsOf(profileId) {
        var lists = {};
        sources().forEach(function (source) { lists[source.id] = KidsProfile.read(profileId, source.id); });
        return lists;
    }

    function store(profileId, lists) {
        Object.keys(lists).forEach(function (sourceId) { KidsProfile.save(profileId, sourceId, lists[sourceId]); });
    }

    // done(lists|null): the picker's ticks, or null on Cancel or with no source.
    function pick(name, lists, done, tell) {
        if (!sources().length) {
            if (tell) tell(I18n.t('kids.noSource'));
            return done(null);
        }
        KidsPicker.open({ name: name, sources: sources(), lists: lists, done: done });
    }

    // Runs `run` once `guardian` can guard: the profile in use sets a PIN if it
    // has none; another profile's PIN is asked for.
    function withGuardian(guardian, run, tell) {
        if (ProfileStore.hasPin(guardian.id)) {
            if (guardian.id === ProfileStore.active().id) return run();
            return PinPad.open('guardian', run, { profileId: guardian.id, name: guardian.name });
        }
        if (tell) tell(I18n.t('kids.pinFirst'));
        PinPad.open('set', run);
    }

    // The grown-up who guards a kids profile made now: the profile in use, or
    // the guardian of the kids profile in use.
    function newGuardian(except) {
        var active = ProfileStore.active();
        if (!active.kids && active.id !== except) return active;
        return KidsProfile.guardianOf(active.kids ? active : { id: except });
    }

    // added(profile|null) after Add, with or without the Kids switch.
    function add(text, added, tell) {
        ProfileDialog.open({
            title: I18n.t('profile.add'),
            text: text,
            value: '',
            ok: I18n.t('profile.addButton'),
            kids: false,
            kidsChanged: function (on) { return I18n.t(on ? 'kids.next' : 'profile.addButton'); },
            validate: function (name) { return ProfileStore.nameError(name, null); },
            done: function (name, kids) {
                if (!name) return added(null);
                if (!kids) return added(ProfileStore.add(name));
                var guardian = newGuardian(null);
                if (!guardian) {
                    if (tell) tell(I18n.t('kids.needGuardian'));
                    return added(null);
                }
                withGuardian(guardian, function () {
                    pick(name, {}, function (lists) {
                        var profile = lists && ProfileStore.add(name);
                        if (profile) {
                            ProfileStore.setKids(profile.id, guardian.id);
                            store(profile.id, lists);
                        }
                        added(profile || null);
                    }, tell);
                }, tell);
            },
        });
    }

    // changed(reload): reload when the profile in use became or stopped being kids.
    function edit(profile, changed, tell) {
        ProfileDialog.open({
            title: I18n.t('profile.rename'),
            text: I18n.t('profile.renameHint', { name: profile.name }),
            value: profile.name,
            ok: I18n.t('common.save'),
            kids: !!profile.kids,
            validate: function (name) { return ProfileStore.nameError(name, profile.id); },
            done: function (name, kids) {
                if (!name) return changed(false);
                ProfileStore.rename(profile.id, name);
                var inUse = profile.id === ProfileStore.active().id;
                if (kids === !!profile.kids) return changed(false);
                if (!kids) {
                    return KidsProfile.guard(profile, function () {
                        ProfileStore.setKids(profile.id, null);
                        KidsProfile.refresh();
                        changed(inUse);
                    });
                }
                var guardian = newGuardian(profile.id);
                if (!guardian) {
                    if (tell) tell(I18n.t('kids.needGuardian'));
                    return changed(false);
                }
                withGuardian(guardian, function () {
                    pick(name, listsOf(profile.id), function (lists) {
                        if (!lists) return changed(false);
                        ProfileStore.setKids(profile.id, guardian.id);
                        store(profile.id, lists);
                        changed(inUse);
                    }, tell);
                }, tell);
            },
        });
    }

    // "What can <name> watch?" for an existing kids profile, after the PIN.
    function choose(profile, changed, tell) {
        KidsProfile.guard(profile, function () {
            pick(profile.name, listsOf(profile.id), function (lists) {
                if (lists) store(profile.id, lists);
                changed(!!lists && profile.id === ProfileStore.active().id);
            }, tell);
        });
    }

    return {
        add: add,
        edit: edit,
        choose: choose,
        // The kids profiles, for Settings > Profiles.
        profiles: function () { return ProfileStore.list().filter(function (profile) { return profile.kids; }); },
    };
})();
