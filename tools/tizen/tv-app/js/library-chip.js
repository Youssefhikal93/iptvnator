window.LibraryChip = function (root, item, currentSourceId) {
    'use strict';

    if (!item.sourceId || item.sourceId === currentSourceId) return;
    var chip = document.createElement('span');
    chip.className = 'source-chip';
    chip.textContent = item.sourceName;
    root.appendChild(chip);
};
