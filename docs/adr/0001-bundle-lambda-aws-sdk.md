# ADR 0001: Bundle Lambda AWS SDK Clients

Date: 2026-06-26

Status: Accepted

Deciders: Vinny Carpenter

## Context

Barometer's Lambda handler uses AWS SDK v3 clients for S3, SNS, and CloudWatch. AWS Lambda's managed Node.js runtimes include an AWS SDK, but the included minor version can differ from the local package version and can change with runtime updates. The engine is small enough that bundling these clients keeps the artifact modest while making production dependency behavior match local tests and builds.

## Decision

Bundle the `@aws-sdk/*` clients into the Lambda artifact with esbuild instead of externalizing them to the managed Lambda runtime.

## Consequences

Easier:

- Local dependency versions and deployed dependency versions match.
- Runtime upgrades are less likely to change SDK behavior silently.
- The Lambda zip remains self-contained for the SDK clients it uses.

Harder:

- The Lambda bundle is larger than when SDK clients were externalized.
- SDK updates require dependency updates and a new deploy.

Out of scope:

- Replacing AWS SDK clients.
- Changing the Lambda runtime.
- Adding a separate dependency-layer workflow.

## Alternatives

- Externalize `@aws-sdk/*` and use the runtime-provided SDK. Rejected because production behavior would depend on the managed runtime's bundled SDK version.
- Keep the SDK externalized but add a Lambda smoke test. Rejected because a smoke test detects drift after deployment rather than preventing it.
- Build a shared Lambda layer for SDK clients. Rejected because it adds operational complexity for one small function.
