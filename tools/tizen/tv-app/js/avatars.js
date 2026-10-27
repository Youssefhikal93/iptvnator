// Local 3D animal artwork keeps the profile colour visible through transparency.
window.Avatars = (() => {
    'use strict';

    const { html } = UI;
    const ids = [
        'fox', 'penguin', 'cat', 'frog', 'lion', 'sloth', 'bear', 'owl',
        'unicorn', 'rabbit', 'koala', 'dragon', 'monkey', 'panda', 'octopus',
        // Illustrated characters from the Klar website, backgrounds cut out.
        'accounting', 'cfo', 'coo', 'cto', 'nurse', 'physician', 'psychiatrist', 'psychologist', 'social-worker',
    ];
    // Retired choices still render without rewriting saved profiles.
    const aliases = { princess: 'unicorn', wizard: 'owl', pig: 'monkey' };
    const resolve = (id) => Object.prototype.hasOwnProperty.call(aliases, id) ? aliases[id] : id;

    return {
        ids,
        has: (id) => ids.indexOf(resolve(id)) !== -1,
        art: (id) => html`<img class="avatar-art" src=${'avatars/' + resolve(id) + '.webp'} alt="" draggable="false" />`,
    };
})();
