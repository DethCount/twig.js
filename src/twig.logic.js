var Twig = (function (Twig) {
    "use strict";

    /**
     * Namespace for logic handling.
     */
    Twig.logic = {};

    /**
     * Logic token types.
     */
    Twig.logic.type = {
        if_: 'if',
        endif: 'endif',
        for_: 'for',
        endfor: 'endfor',
        else_: 'else',
        elseif: 'elseif',
        set: 'set'
    };

    /**
     * Regular expressions to match templates to.
     *
     * Properties:
     *
     *      type:  The type of expression this matches
     *
     *      regex: A regular expression that matches the format of the token
     *
     *      next:  What logic tokens (if any) pop this token off the logic stack. If empty, the
     *             logic token is assumed to not require an end tag and isn't push onto the stack.
     *
     *      open:  Does this tag open a logic expression or is it standalone. For example,
     *             {% endif %} cannot exist without an opening {% if ... %} tag, so open = false.
     *
     *  Functions:
     *
     *      compile: A function that handles compiling the token into an output token ready for
     *               parsing with the parse function.
     *
     *      parse:   A function that parses the compiled token into output (HTML / whatever the
     *               template represents).
     */
    Twig.logic.definitions = [
        {
            /**
             * If type logic tokens.
             *
             *  Format: {% if expression %}
             */
            type: Twig.logic.type.if_,
            regex: /^if\s+([^\s].+)$/,
            next: [
                Twig.logic.type.else_,
                Twig.logic.type.elseif,
                Twig.logic.type.endif
            ],
            open: true,
            compile: function (token) {
                var expression = token.match[1];
                // Compile the expression.
                token.stack = Twig.expression.compile({
                    type:  Twig.expression.type.expression,
                    value: expression
                }).stack;
                delete token.match;
                return token;
            },
            parse: function (token, context, chain) {
                var output = '';
                // Start a new logic chain
                chain = true;

                // Parse the expression
                var result = Twig.expression.parse(token.stack, context);
                if (result === true) {
                    chain = false;
                    // parse if output
                    output = Twig.parse(token.output, context);
                }
                return {
                    chain: chain,
                    output: output
                };
            }
        },
        {
            /**
             * Else if type logic tokens.
             *
             *  Format: {% elseif expression %}
             */
            type: Twig.logic.type.elseif,
            regex: /^elseif\s+([^\s].*)$/,
            next: [
                Twig.logic.type.else_,
                Twig.logic.type.endif
            ],
            open: false,
            compile: function (token) {
                var expression = token.match[1];
                // Compile the expression.
                token.stack = Twig.expression.compile({
                    type:  Twig.expression.type.expression,
                    value: expression
                }).stack;
                delete token.match;
                return token;
            },
            parse: function (token, context, chain) {
                var output = '';
                if (chain) {
                    var result = Twig.expression.parse(token.stack, context);
                    if (result === true) {
                        chain = false;
                        // parse if output
                        output = Twig.parse(token.output, context);
                    }
                }
                return {
                    chain: chain,
                    output: output
                };
            }
        },
        {
            /**
             * Else if type logic tokens.
             *
             *  Format: {% elseif expression %}
             */
            type: Twig.logic.type.else_,
            regex: /^else$/,
            next: [
                Twig.logic.type.endif,
                Twig.logic.type.endfor
            ],
            open: false,
            parse: function (token, context, chain) {
                var output = '';
                if (chain) {
                    output = Twig.parse(token.output, context);
                }
                return {
                    chain: chain,
                    output: output
                };
            }
        },
        {
            /**
             * End if type logic tokens.
             *
             *  Format: {% endif %}
             */
            type: Twig.logic.type.endif,
            regex: /^endif$/,
            next: [ ],
            open: false
        },
        {
            /**
             * For type logic tokens.
             *
             *  Format: {% for expression %}
             */
            type: Twig.logic.type.for_,
            regex: /^for\s+([a-zA-Z0-9_,\s]+)\s+in\s+([^\s].+)$/,
            next: [
                Twig.logic.type.else_,
                Twig.logic.type.endfor
            ],
            open: true,
            compile: function (token) {
                var key_value = token.match[1],
                    expression = token.match[2];

                token.key_var = null;
                token.value_var = null;

                if (key_value.indexOf(",") >= 0) {
                    var kv_split = key_value.split(',');
                    if (kv_split.length === 2) {
                        token.key_var = kv_split[0].trim();
                        token.value_var = kv_split[1].trim();
                    } else {
                        throw "Invalid expression in for loop: " + key_value;
                    }
                } else {
                    token.value_var = key_value;
                }

                // Valid expressions for a for loop
                //   for item     in expression
                //   for key,item in expression

                // Compile the expression.
                var expression_stack = Twig.expression.compile({
                    type:  Twig.expression.type.expression,
                    value: expression
                }).stack;

                if (expression_stack.length !== 1) {
                    throw "Invalid expression in for loop, expected one expression, got " + expression_stack;

                } else {
                    // Validate that the expression is an explicit array or object
                    //  declaration or that it's a variable.
                    var expression_token = expression_stack.pop();
                    if (expression_token.type !== Twig.expression.type.array
                        && expression_token.type !== Twig.expression.type.object
                        && expression_token.type !== Twig.expression.type.variable) {

                        throw "Invalid expression in for loop " + expression_token.type;
                    }
                    token.expression = expression_token;
                }

                delete token.match;
                return token;
            },
            parse: function (token, context, continue_chain) {
                // Parse expression
                var result = Twig.expression.parse(token.expression, context),
                    output = [],
                    key;

                if (result instanceof Array) {
                    key = 0;
                    result.forEach(function (value) {
                        context[token.value_var] = value;
                        if (token.key_var) {
                            context[token.key_var] = key;
                        }
                        output.push(Twig.parse(token.output, context));

                        key += 1;
                    });
                } else if (result instanceof Object) {
                    for (key in result) {
                        if (result.hasOwnProperty(key)) {
                            context[token.value_var] = result[key];
                            if (token.key_var) {
                                context[token.key_var] = key;
                            }
                            output.push(Twig.parse(token.output, context));
                        }
                    }
                }
                // Only allow else statements if no output was generated
                continue_chain = (output.length === 0);

                return {
                    chain: continue_chain,
                    output: output.join("")
                };
            }
        },
        {
            /**
             * End if type logic tokens.
             *
             *  Format: {% endif %}
             */
            type: Twig.logic.type.endfor,
            regex: /^endfor$/,
            next: [ ],
            open: false
        }
    ];

    /**
     * Registry for logic handlers.
     */
    Twig.logic.handler = {};

    /**
     * Register a new logic token type.
     */
    Twig.logic.extendType = function (type, value) {
        value = value || type;
        Twig.logic.type[type] = value;
    };

    /**
     * Extend the logic parsing functionality with a new token definition.
     */
    Twig.logic.extend = function (definition) {

        if (!definition.type) {
            throw "Unable to extend logic definition. No type provided for " + definition;
        }
        Twig.logic.handler[definition.type] = definition;
    };

    // Extend with built-in expressions
    while (Twig.logic.definitions.length > 0) {
        Twig.logic.extend(Twig.logic.definitions.shift());
    }

    /**
     * Compile logic tokens into JSON form ready for parsing.
     */
    Twig.logic.compile = function (raw_token) {
        var expression = raw_token.value.trim(),
            token = Twig.logic.tokenize(expression),
            token_template = Twig.logic.handler[token.type];

        if (Twig.trace) {
            console.log("Twig.logic.compile: ", "Compiling logic token ", token);
        }

        // Check if the token needs compiling
        if (token_template.compile) {
            token = token_template.compile(token);
            if (Twig.trace) {
                console.log("Twig.logic.compile: ", "Compiled logic token to ", token);
            }
        }

        return token;
    };

    /**
     * Tokenize logic expressions. This function matches token expressions against regular
     * expressions provided in token definitions provided with Twig.logic.extend.
     *
     * @param {string} expression the logic token expression to tokenize
     *                (i.e. what's between {% and %})
     *
     * @return {Object} The matched token with type set to the token type and match to the regex match.
     */
    Twig.logic.tokenize = function (expression) {
        var token = {},
            token_template_type,
            token_type,
            token_regex,
            regex_array;

        // Ignore whitespace around expressions.
        expression = expression.trim();

        for (token_template_type in Twig.logic.handler) {
            if (Twig.logic.handler.hasOwnProperty(token_template_type)) {
                // Get the type and regex for this template type
                token_type = Twig.logic.handler[token_template_type].type;
                token_regex = Twig.logic.handler[token_template_type].regex;

                // Handle multiple regular expressions per type.
                regex_array = [];
                if (token_regex instanceof Array) {
                    regex_array = token_regex;
                } else {
                    regex_array.push(token_regex);
                }

                // Check regular expressions in the order they were specified in the definition.
                while (regex_array.length > 0)  {
                    var regex = regex_array.shift();
                    var match = regex.exec(expression.trim());
                    if (match !== null) {
                        token.type  = token_type;
                        token.match = match;
                        if (Twig.trace) {
                            console.log("Twig.logic.tokenize: ", "Matched a ", token_type, " regular expression of ", match);
                        }
                        return token;
                    }
                }
            }
        }

        throw "Unable to parse '" + expression.trim() + "'";
    };

    Twig.logic.parse = function (token, context, chain) {
        var output = '',
            token_template;

        // What does chain mean:
        //   Should we continue a chain of expressions?
        //   If false, no logic token with an open: false should be evaluated
        //     e.g. If an {% if ... %} evaluates true, then sets chain = false, any
        //          following tokens with open=false (else, elseif) should be ignored.

        if (Twig.trace) {
            console.log("Twig.logic.parse: " ,"Parsing logic token ", token);
        }

        token_template = Twig.logic.handler[token.type];

        if (token_template.parse) {
            output = token_template.parse(token, context, chain);
        }
        return output;
    };

    return Twig;

})( Twig || { } );
