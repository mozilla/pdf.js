
const defaultOptions = {
    canPrint: {
        /** @type {boolean} */
        value: false,
    },
};

const McUserOptions = Object.create(null);

class MCOptions {
    constructor() {
        throw new Error('Cannot initialize AppOptions.');
    }

    static get(name) {
        let defaultOption = defaultOptions[name];
        let MCUserOption = McUserOptions[name];
        if (MCUserOption !== undefined) {
            return MCUserOption;
        }

        return (defaultOption !== undefined ? defaultOption.value : undefined);
    }

    static set(name, value) {
        McUserOptions[name] = value;
    }
}

export {
    MCOptions,
};
