// The Intro group of the player's ▲ menu (#102), for the season playing:
// the show's Skip intro button switch, the season's times as Starts and Ends
// pills, and Reset. On the Times row ◀ ▶ pick a pill and OK edits it: ▲ ▼
// change the digit, ◀ ▶ move along mm:ss, 0–9 type, OK saves, Return
// cancels. While the button is off, Times and Reset are greyed and skipped.
//
// hooks.where() -> { show, season } of the episode playing, or null.
// hooks.toast(text) says why a time was not saved.
window.PlayerIntro = function (hooks) {
    'use strict';

    // Highest value of each digit of mm:ss.
    var LIMITS = [9, 9, 5, 9];
    var s = fresh();

    function fresh() {
        // pill: 0 Starts, 1 Ends; edit: { digits, at } while a pill is open;
        // draft: a time saved while the other is still missing.
        return { pill: 0, edit: null, draft: null, where: '' };
    }

    function clock(ms) {
        if (ms === null || ms === undefined) return '--:--';
        var total = Math.floor(ms / 1000);
        var m = Math.floor(total / 60);
        var sec = total % 60;
        return (m < 10 ? '0' : '') + m + ':' + (sec < 10 ? '0' : '') + sec;
    }

    function digitsOf(ms) {
        var text = clock(ms || 0).replace(':', '');
        return text.split('').map(Number);
    }

    function msOf(digits) {
        return ((digits[0] * 10 + digits[1]) * 60 + digits[2] * 10 + digits[3]) * 1000;
    }

    function place() {
        var where = hooks.where();
        var id = where ? where.show + '\n' + where.season : '';
        // Another episode's season: start over on Starts with nothing open.
        if (id !== s.where) {
            s = fresh();
            s.where = id;
        }
        return where;
    }

    // The times on the pills: the draft over the saved ones.
    function times(where) {
        var mark = IntroMarks.get(where.show, where.season);
        var from = mark ? mark.from : null;
        var to = mark ? mark.to : null;
        if (s.draft) {
            if (s.draft.from !== undefined) from = s.draft.from;
            if (s.draft.to !== undefined) to = s.draft.to;
        }
        return { from: from, to: to, mark: mark };
    }

    function seasonText(where) {
        return where.season === undefined || where.season === null || where.season === '' ? '' : I18n.t('episodes.season', { n: where.season }) + ' · ';
    }

    // Where the times come from, under the Times row.
    function source(where, mark) {
        var text = !mark ? I18n.t('player.introNone')
            : mark.kind === 'hand' ? I18n.t('player.introByHand')
            : mark.kind === 'learnt' ? I18n.t('player.introLearnt')
            : mark.season !== undefined ? I18n.t('player.introFrom', { season: I18n.t('episodes.season', { n: mark.season }) })
            : I18n.t('player.introEarlier');
        if (s.draft) text = I18n.t(s.draft.from === undefined ? 'player.introSetStarts' : 'player.introSetEnds');
        return seasonText(where) + text;
    }

    function save(where, pill, ms) {
        var now = times(where);
        var from = pill === 0 ? ms : now.from;
        var to = pill === 1 ? ms : now.to;
        // A start at or past the saved end waits for a new end: on to Ends.
        if (pill === 0 && to !== null && !(to > from)) {
            s.draft = { from: ms };
            s.pill = 1;
            return true;
        }
        if (from !== null && to !== null) {
            if (!(to > from)) {
                hooks.toast(I18n.t('player.introOrder'));
                return false;
            }
            IntroMarks.setByHand(where.show, where.season, from, to);
            s.draft = null;
        } else {
            // The other time is still missing: the focus goes to it.
            s.draft = s.draft || {};
            s.draft[pill === 0 ? 'from' : 'to'] = ms;
            s.pill = pill === 0 ? 1 : 0;
        }
        return true;
    }

    // Keys on the Times row; true when the row took the key.
    function timesKey(code) {
        var where = place();
        if (!where) return false;
        var edit = s.edit;
        if (!edit) {
            if (code === Keys.RIGHT && s.pill === 0) s.pill = 1;
            else if (code === Keys.LEFT && s.pill === 1) s.pill = 0;
            else if (code === Keys.ENTER) {
                var now = times(where);
                var start = s.pill === 0 ? now.from : now.to;
                if (start === null) start = s.pill === 1 && now.from !== null ? now.from : 0;
                s.edit = { digits: digitsOf(start), at: 0 };
            } else return false;
            return true;
        }
        if (code === Keys.UP || code === Keys.DOWN) {
            var top = LIMITS[edit.at] + 1;
            edit.digits[edit.at] = (edit.digits[edit.at] + (code === Keys.UP ? 1 : -1) + top) % top;
        } else if (code === Keys.LEFT) edit.at = Math.max(0, edit.at - 1);
        else if (code === Keys.RIGHT) edit.at = Math.min(3, edit.at + 1);
        else if (code >= 48 && code <= 57) {
            edit.digits[edit.at] = Math.min(LIMITS[edit.at], code - 48);
            edit.at = Math.min(3, edit.at + 1);
        } else if (code === Keys.ENTER) {
            if (save(where, s.pill, msOf(edit.digits))) s.edit = null;
        } else if (Keys.isBack(code)) s.edit = null;
        // Every other key waits until the pill is saved or cancelled.
        return true;
    }

    function pill(label, ms, index) {
        var edit = s.edit && s.pill === index ? s.edit : null;
        return { label: label, value: edit ? null : clock(ms), digits: edit ? edit.digits : null, at: edit ? edit.at : -1, focus: s.pill === index };
    }

    return {
        // Closing the menu drops a pill left open.
        closed: function () {
            s.edit = null;
        },
        // The group, through the menu's head, widget and info (player-menu.js).
        entries: function (m) {
            var where = place();
            if (!where) return;
            var on = IntroMarks.shown(where.show);
            var now = times(where);
            var value = !on ? I18n.t('common.off') : now.mark ? clock(now.mark.from) + '–' + clock(now.mark.to) : I18n.t('player.introNotSet');
            m.head(I18n.t('player.intro'), value);
            m.widget({ kind: 'switch', label: I18n.t('player.introButton'), note: I18n.t('player.introButtonNote'), on: on,
                run: function () { IntroMarks.setShown(where.show, !on); } });
            m.widget({ kind: 'pills', label: I18n.t('player.introTimes'), note: source(where, now.mark), disabled: !on, keys: I18n.t(s.edit ? 'player.introKeysEdit' : 'player.introKeysPills'),
                pills: [pill(I18n.t('player.introStarts'), now.from, 0), pill(I18n.t('player.introEnds'), now.to, 1)], key: timesKey });
            m.widget({ kind: 'action', label: I18n.t('player.introReset'), disabled: !on || (!now.mark && !s.draft),
                run: function () {
                    IntroMarks.reset(where.show, where.season);
                    s.draft = null;
                    hooks.toast(I18n.t('player.introResetDone'));
                } });
            if (!on) m.info(I18n.t('player.introOff'));
        },
    };
};
