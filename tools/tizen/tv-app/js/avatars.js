// Local 3D artwork keeps the profile colour visible through transparency.
window.Avatars = (() => {
    'use strict';

    const { html } = UI;
    const ids = [
        'fox', 'penguin', 'frog', 'lion', 'sloth', 'unicorn',
        'rabbit', 'dragon', 'panda', 'octopus', 'cto', 'nurse-hijab',
    ];
    // Retired choices still render without rewriting saved profiles.
    const aliases = {
        princess: 'unicorn', wizard: 'penguin', pig: 'sloth',
        cat: 'fox', bear: 'panda', owl: 'penguin', koala: 'panda', monkey: 'sloth',
        accounting: 'cto', cfo: 'cto', coo: 'penguin', psychiatrist: 'cto', psychologist: 'fox',
        nurse: 'nurse-hijab', physician: 'nurse-hijab', 'social-worker': 'nurse-hijab',
    };
    const resolve = (id) => Object.prototype.hasOwnProperty.call(aliases, id) ? aliases[id] : id;

    return {
        ids,
        has: (id) => ids.indexOf(resolve(id)) !== -1,
        art: (id) => html`<img class="avatar-art" src=${'avatars/' + resolve(id) + '.webp'} alt="" draggable="false" />`,
    };
})();
