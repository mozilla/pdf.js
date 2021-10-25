module: {
    rules: [
        {
            test: /pdf\.worker\.js$/,
            type: 'asset/inline',
            generator: {
                dataUrl: content => {
                    return content.toString();
                }
            }
        }
    ]
}