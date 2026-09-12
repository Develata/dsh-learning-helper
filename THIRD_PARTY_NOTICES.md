# Third-party notices

Learning Helper source and the original demonstration lecture are MIT licensed; see [LICENSE](LICENSE).

The application uses [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (MIT) for its Agent/runtime, storage infrastructure and native Web shell. Its pinned packages and their notices remain in the distributed dependency tree. Learning semantics, evidence storage, grading/adaptation and UI are maintained here.

Direct runtime components include Zod (MIT), React (MIT), and the Harness packages in package.json. TypeScript (Apache-2.0), esbuild (MIT), tsx (MIT), pnpm (MIT), and Harness's Playwright (Apache-2.0) are build/test tools. Node.js and the Docker distribution include their own third-party licenses; consult shipped packages for complete transitive notices.

[dsh-teacher](https://github.com/Yihong89/dsh-teacher) was studied as an external plugin/quiz UX reference. No dsh-teacher source is copied or bundled, and it is not a dependency. The browser entry follows the pinned Harness public client-module factory contract.

`demo/math-analysis/lecture-03.md` is an original teaching example, not a copied textbook chapter. `injection.txt` is a synthetic security fixture.
