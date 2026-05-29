````xml
<copilot-instructions>

<architecture>
    <general-principles>
        - Follow best practices for enterprise-grade applications.
        - Prioritize modularity, DRY (Don't Repeat Yourself), performance, and security.
        - First, break complex tasks into distinct, prioritized steps, then implement them.
        - Prioritize the tasks and steps you will address in each response.
    </general-principles>

    <layered-architecture>
        1. **Controller Layer (`/controllers`)**: Handles HTTP requests/responses, input validation, and delegates tasks to the service layer. Should remain thin.
        2. **Service Layer (`/services`)**: Contains all business logic. Orchestrates calls to the repository layer and other services.
        3. **Repository Layer (`/repository`)**: Provides an abstraction over the database. All database queries should be handled here.
        4. **Model Layer (`/models`)**: Defines Mongoose database schemas and data models.
    </layered-architecture>

    <design-patterns>
        - **Repository Pattern**: Abstract all database operations in the `/repository` directory.
        - **Singleton Pattern**: Use for database connections (Mongoose) and the Redis client to ensure a single instance.
        - **Middleware Pattern**: Use for cross-cutting concerns like authentication, logging, and error handling in the `/middlewares` directory.
    </design-patterns>
</architecture>

<coding-standards>
    <general-rules>
        - Use ES module syntax (`import`/`export`).
        - Favor modern JavaScript features (ES2020+), including optional chaining (`?.`) and nullish coalescing (`??`).
        - Use destructuring for objects and arrays where it improves readability.
        - Always use Functional Programming principles over OOP.
        - Use the `using` declaration for managing disposable resources with automatic cleanup.
    </general-rules>

    <using-declaration>
        The `using` declaration declares block-scoped local variables that are synchronously disposed. It ensures resources are automatically cleaned up when the scope exits.

        **Basic Syntax**:
        ```javascript
        using resource = new Resource();
        // resource[Symbol.dispose]() is called when scope exits
        ```

        **Requirements**:
        - The resource must have a `[Symbol.dispose]()` method.
        - The variable must be initialized (cannot be reassigned like `const`).
        - The value can be `null`, `undefined`, or an object with `[Symbol.dispose]()`.

        **Usage Contexts**:
        - **In a block**: Resource is disposed when exiting the block.
          ```javascript
          {
            using resource = new Resource();
            console.log(resource.getValue());
            // resource disposed here
          }
          ```
        - **In a function**: Resource is disposed before the function returns.
          ```javascript
          function example() {
            using resource = new Resource();
            return resource.getValue();
            // resource disposed before return
          }
          ```
        - **In a for...of loop**: Resource is disposed on each iteration.
          ```javascript
          const resources = [new Resource(), new Resource()];
          for (using resource of resources) {
            console.log(resource.getValue());
            // resource disposed at end of each iteration
          }
          ```
        - **Multiple resources**: Disposed in reverse order of declaration.
          ```javascript
          using resource1 = new Resource();
          using resource2 = new Resource();
          // resource2 disposed first, then resource1
          ```

        **Important Notes**:
        - Cannot be used at the top level of a script (only in modules, functions, or blocks).
        - Cannot be used in `for...in` loops or at the top level of switch statements.
        - All disposers are guaranteed to run, even if errors occur (similar to `finally` blocks).
        - If a resource is captured by a closure, it will be disposed when the scope exits, not when the closure is called.
        - Use `DisposableStack` for manual resource management while maintaining the same error handling guarantees.
    </using-declaration>

    <code-style>
        - Follow the configurations in `eslint.config.js` and `.prettierrc`.
    </code-style>

    <naming-conventions>
        - **Files**: `camelCase.js`
        - **Functions/Variables**: `camelCase`
        - **Constants**: `UPPER_SNAKE_CASE`
        - **Environment Variables**: `UPPER_SNAKE_CASE`
    </naming-conventions>
</coding-standards>

<implementation-details>
    <error-handling>
        - Use the `httpError` utility from `/utils` for creating consistent, standardized HTTP errors.
        - Wrap all asynchronous controller functions and middlewares with the `asyncHandler` utility from `/utils` to handle errors gracefully and pass them to the global error handler.
        - The `globalErrorHandler` middleware in `/middlewares` is responsible for processing all errors and sending a formatted response.
    </error-handling>

    <logging>
        - Use the `logger` utility from `/utils` for all logging.
        - Use appropriate log levels: `logger.error()`, `logger.warn()`, `logger.info()`, `logger.debug()`.
        - Example: `logger.error('Failed to process payment', { meta: { error: err.message, userId: user._id } });`
    </logging>

    <response-handling>
        - Use the `httpResponse` utility from `/utils` to send all successful responses from controllers. This ensures a consistent response format across the API.
    </response-handling>

    <input-validation>
        - Validate all incoming request bodies, params, and queries.
        - Define validation schemas using Joi in the `/validations` directory.
        - Apply validation middleware in the routes, before the controller handler.
    </input-validation>



        - Always validate and sanitize user input to prevent injection attacks.
        - Follow OWASP Top 10 best practices.




</implementation-details>

<development-workflow>
    <testing>
        <strategy>
            Choose the right test type based on project phase and complexity:
        </strategy>

        <unit-tests>
            **Best For**: Early project phases and exceptionally complex, narrow functions.
            - Use at the start of a project to help get things moving.
            - Ideal for functions with high complexity where logic is hard to get right on the first try.
            - **Caution**: Avoid becoming too attached to unit tests. They break frequently when implementation changes, making refactoring difficult.
            - Write unit tests for critical utility functions and complex business logic.
        </unit-tests>

        <integration-tests>
            **The "Sweet Spot"**: The ideal balance for most scenarios.
            - High-level enough to test system correctness.
            - Low-level enough to be easy to debug with a good debugger.
            - Focus on these as the code begins to firm up and the system stabilizes.
            - Write integration tests for all API endpoints.
            - Test interactions between services, repositories, and the database.
        </integration-tests>

        <e2e-tests>
            **Best For**: Demonstrating that the whole system works end-to-end.
            - Keep this suite small and well-curated.
            - Focus strictly on the most common UI features and a few critical edge cases.
            - Avoid excessive E2E tests—too many become impossible to maintain and end up being ignored.
        </e2e-tests>

        <regression-tests>
            **Best For**: Bug fixes and preventing regressions.
            - When a bug is found, first reproduce it with a regression test.
            - Then fix the bug while ensuring the test passes.
            - This ensures the bug doesn't resurface in future changes.
        </regression-tests>

        <implementation>
            - Organize all test files in the `test/` directory.
            - Use `node:test` for the test runner and `node:assert` for assertions.
            - Structure tests using `describe`, `it`, `before`, and `after` blocks.
        </implementation>
    </testing>

    <code-review-checklist>
        - [ ] Follows existing patterns and architecture.
        - [ ] Includes proper error handling using `httpError` and `asyncHandler`.
        - [ ] Has appropriate, contextual logging.
        - [ ] Updates Swagger/JSDoc documentation if an API endpoint is changed.
        - [ ] No hardcoded secrets or sensitive values.
        - [ ] Validates all inputs from requests.
        - [ ] Handles edge cases.
    </code-review-checklist>
</development-workflow>

<deployment>
    <docker>
        - Use the `dev.Dockerfile` located in the `docker/` directory for local development builds.
        - Use the `prod.Dockerfile` located in the `docker/` directory for production builds.
    </docker>
    <environment-check>
        - Ensure the correct `.env` file is used for the target environment.
        - Verify all external connections (Database, Redis) are correctly configured before deploying.
    </environment-check>
</deployment>

<resources>
    - [Node.js Best Practices](https://github.com/goldbergyoni/nodebestpractices)
    - [Express Security Best Practices](https://expressjs.com/en/advanced/best-practice-security.html)
    - [MongoDB Security Checklist](https://docs.mongodb.com/manual/administration/security-checklist/)
    - [OWASP Top 10](https://owasp.org/www-project-top-ten/)
</resources>

</copilot-instructions>
````


