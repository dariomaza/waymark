# Changelog

## [0.4.1](https://github.com/dariomaza/waymark/compare/v0.4.0...v0.4.1) (2026-10-05)


### Bug Fixes

* **deploy:** let exported WAYMARK_DEPLOY_* variables win over deploy.env ([6141a5c](https://github.com/dariomaza/waymark/commit/6141a5c45ab230416844ec2e063bf1ee62f454c7))

## [0.4.0](https://github.com/dariomaza/waymark/compare/v0.3.0...v0.4.0) (2026-10-04)


### Features

* a root space has an owner, and ownership follows the tree ([97ac1ac](https://github.com/dariomaza/waymark/commit/97ac1ac042d6a7075d9aaba75ad6bc06edcfc91a))
* a view share and an owner-only move are said for what they are ([144f38f](https://github.com/dariomaza/waymark/commit/144f38f0e3fc3eaa50e6722c511337713865e91a))
* an administrator reads whose each machine token is, in both clients ([d2f868f](https://github.com/dariomaza/waymark/commit/d2f868fb24d74f55b3c1dc5904d5c2e525ee3faa))
* **api-client,i18n:** the People group's calls, codes and words ([849a449](https://github.com/dariomaza/waymark/commit/849a449bbdc115330496ae62237133001a7b79ba))
* **api-client,i18n:** the share calls, what the tree says you may do, and their words ([d098242](https://github.com/dariomaza/waymark/commit/d09824228edbc63424e26aeb619703e53e055fe3))
* **api-client:** accounts answer their temporary password, and a person changes their own ([c43a873](https://github.com/dariomaza/waymark/commit/c43a8732457f142b6520ac66a652d032e5cc6c62))
* **api:** a machine token may be narrowed to chosen spaces ([c797fd2](https://github.com/dariomaza/waymark/commit/c797fd235061952dd148cd48cff7cf610409757b))
* **api:** a person changes their own password, and a temporary one is lifted ([f13a4c5](https://github.com/dariomaza/waymark/commit/f13a4c50ce526584a38e4f0c7a823b7624675b89))
* **api:** a session of an account with a temporary password may only change it ([e66e1b0](https://github.com/dariomaza/waymark/commit/e66e1b0f220b0c4f6c59934a5af34313a5a7621e))
* **api:** an account can be marked as one whose password must be changed ([be73a5d](https://github.com/dariomaza/waymark/commit/be73a5df2940ec4cba89fa0d97f9fe11d52b5a92))
* **api:** an administrator manages accounts, and a disabled one opens nothing ([1dfe1ba](https://github.com/dariomaza/waymark/commit/1dfe1ba8270c441b023f351f8f3ab2db0cddd724))
* **api:** every account has a role and every machine token a person ([fcddb71](https://github.com/dariomaza/waymark/commit/fcddb71b64b85161e6c779a71b644043e5cecc21))
* **api:** people manage the machine tokens they issued; an administrator manages all ([0c70a8c](https://github.com/dariomaza/waymark/commit/0c70a8c1bb3c70bd903506bcd9197a09cc149741))
* **api:** resolve what a person may see once per request ([0fdce0b](https://github.com/dariomaza/waymark/commit/0fdce0b898d1d914f59e98bc7bcf93df22492126))
* **api:** the administrator shares a space, and the tree says what the caller may do ([a99d73a](https://github.com/dariomaza/waymark/commit/a99d73a7ac515164f5a3ddcbd3eab4f5e0e1186c))
* **api:** the server generates a temporary password for a new or reset account ([f6dc105](https://github.com/dariomaza/waymark/commit/f6dc105eea4c666f493d1d201a86b3cf958bbdfc))
* **domain:** a machine token's access is its issuer's, narrowed to chosen spaces ([1e5761e](https://github.com/dariomaza/waymark/commit/1e5761e1b2146cb0323c15328b28e9d40cfacfec))
* **domain:** a ShareRepository port, with its contract, fake and Prisma adapter ([691d612](https://github.com/dariomaza/waymark/commit/691d612e3f19d6b80858680553e56e82f88c56fe))
* **domain:** resolve what a person may see from ownership and shares ([592bf43](https://github.com/dariomaza/waymark/commit/592bf43ccb7b42595e6e65ab98e7ddb09112d093))
* every item and a single item show only what a person may see ([6f543d6](https://github.com/dariomaza/waymark/commit/6f543d68ceb37e4b5bf5e06f663077df89362602))
* every write is checked against what a person may change ([ac4b6d0](https://github.com/dariomaza/waymark/commit/ac4b6d0b383d2789babd6f21e9ebbeb99c9c803f))
* **mobile:** a person changes their own password from the account screen ([78c24a0](https://github.com/dariomaza/waymark/commit/78c24a0a02dc565aca7b964f198eb4917be68c3c))
* **mobile:** a space shared to look at offers nothing that would change it ([58dceef](https://github.com/dariomaza/waymark/commit/58dceef8e9d3500fd385d1ffb46844c3d8fe0352))
* **mobile:** a temporary password opens only the screen that chooses your own ([951757b](https://github.com/dariomaza/waymark/commit/951757b85f7d5a506beefd8fde022df6a483c223))
* **mobile:** an administrator shares a space from its menu, one choice per person, saved as it is made ([a44ff97](https://github.com/dariomaza/waymark/commit/a44ff979dc151f94209f84f343acb0bfa400b870))
* **mobile:** the home screen says whose each space is, and marks one shared to look at ([7b93f3c](https://github.com/dariomaza/waymark/commit/7b93f3c9997ce7833caf5f24a65df9ba9a702842))
* **mobile:** the People group shows a new or reset person's temporary password once ([8afe55f](https://github.com/dariomaza/waymark/commit/8afe55f89dc633421e1ff6d0b4bc511d888ed154))
* **mobile:** the People group, for an administrator ([60f6348](https://github.com/dariomaza/waymark/commit/60f6348c026664702f27dc4f152d6ea8f3c68388))
* OUTSIDE_TOKEN_SPACES is said in every consumer, and a client can choose spaces ([b86a78d](https://github.com/dariomaza/waymark/commit/b86a78dd8737ebb30e9c2b95800606600e852a7f))
* photos, the processing queue and QR images only for who may see them ([94f1de3](https://github.com/dariomaza/waymark/commit/94f1de3659094dcd31253d97315a1bd50b76d50b))
* search finds only what a person may see, filtered before the limit ([a88c570](https://github.com/dariomaza/waymark/commit/a88c570d5822a0c4b0a3d7fa77d73426b3414378))
* the new-token form chooses the spaces a token may see, in both clients ([93e6941](https://github.com/dariomaza/waymark/commit/93e69411a10b5f0dd3e649920a3630dad1b8aa7e))
* the tree and a single space show only what a person may see ([8b47401](https://github.com/dariomaza/waymark/commit/8b4740129ad8aae7897716028a1f37f6603985b4))
* **web:** a person changes their own password from the account screen ([4a6addf](https://github.com/dariomaza/waymark/commit/4a6addfb87303b29c2c12f0c1c69661b2cc22a2f))
* **web:** a space shared to look at offers nothing that would change it ([dba03f9](https://github.com/dariomaza/waymark/commit/dba03f9aa49e49804c2991fc9f6322d8c690da94))
* **web:** a temporary password opens only the screen that chooses your own ([7a2e523](https://github.com/dariomaza/waymark/commit/7a2e5237e12686ebb80712751f7f6a186661da0d))
* **web:** an administrator shares a space from its menu, one choice per person, saved as it is made ([06d86c5](https://github.com/dariomaza/waymark/commit/06d86c53c617abb1a644dcf35e5c7ed54fb78398))
* **web:** the home screen says whose each space is, and marks one shared to look at ([ba4b4b3](https://github.com/dariomaza/waymark/commit/ba4b4b345aeaec27bbe390d81729ee5cd6908d42))
* **web:** the People group shows a new or reset person's temporary password once ([3550c5d](https://github.com/dariomaza/waymark/commit/3550c5d8ddd3db85e71eeadeaa5b5c83207e54de))
* **web:** the People group, for an administrator ([b1224d6](https://github.com/dariomaza/waymark/commit/b1224d67ae2764a49f782d2787e05eaad6dd7fd5))


### Bug Fixes

* **api:** rotating a machine token keeps the person it belongs to ([b7ede00](https://github.com/dariomaza/waymark/commit/b7ede0039af06837217b1f18287285d55387f956))
* **mobile:** a labelled icon is announced, not hidden by lucide ([0b2dd72](https://github.com/dariomaza/waymark/commit/0b2dd728b4fbb49e458aac4ed1ef65d34babb183))
* **web,mobile:** send account requests in the shape the API now takes ([0c15a3e](https://github.com/dariomaza/waymark/commit/0c15a3eeda2d6d4c7f1e14527ec0392bcb200584))

## [0.3.0](https://github.com/dariomaza/waymark/compare/v0.2.0...v0.3.0) (2026-10-01)


### Features

* **mobile:** the account screen is the same grouped settings as the browser's ([a36153c](https://github.com/dariomaza/waymark/commit/a36153c7d0413eb3bce34ae1c06b6cdbb758613f))
* **ui:** a button with a picture and no word is a 48 square in both clients ([a96e54b](https://github.com/dariomaza/waymark/commit/a96e54b9f4fc42be34ce295148c4cbb51deb0707))
* **ui:** both icon sets can say more about this, and where a program points ([2202073](https://github.com/dariomaza/waymark/commit/2202073dd6b74c8a06df4b7e3f20e148adb81a8f))
* **ui:** language and appearance are one 48px segmented control, as rows, in both clients ([db5269f](https://github.com/dariomaza/waymark/commit/db5269fd3ddd9dbe7d8a565f94c1fa850dfdb3c4))
* **web:** the account screen is grouped settings, with its actions as icons beside what they act on ([23821b4](https://github.com/dariomaza/waymark/commit/23821b489da0ff6df71d839d8c91d792e9c30afa))


### Bug Fixes

* **mobile:** tests keep the offline retry and drop its half second of real time ([130bd00](https://github.com/dariomaza/waymark/commit/130bd00eb4dcc9e58376e2acf5a93c59bdb90f14))
* the MCP address stays on one line in both clients ([decfe67](https://github.com/dariomaza/waymark/commit/decfe6730fa48c323271a5536b9847ef092598a5))
* **web:** tests keep the offline retry and drop its half second of real time ([f6c36cb](https://github.com/dariomaza/waymark/commit/f6c36cbbb0fe00372476647721575aeb6ef19d25))

## [0.2.0](https://github.com/dariomaza/waymark/compare/v0.1.0...v0.2.0) (2026-09-29)


### Features

* **i18n:** the words for choosing how the app looks ([fe8d40c](https://github.com/dariomaza/waymark/commit/fe8d40cb8509a5da3a7a294ee2128e6acebdef07))
* **mobile:** the account screen chooses light, dark or the phone's scheme ([eeceb69](https://github.com/dariomaza/waymark/commit/eeceb69eef9f2d13dbbd26280468a50a32df9303))
* **mobile:** the app bar draws the name as the logo, and the mark is the w with the pin ([54c3822](https://github.com/dariomaza/waymark/commit/54c3822051986cd8d4848e7bc70ff387e0b0f814))
* **mobile:** the launch screen follows the phone's light or dark scheme ([5972625](https://github.com/dariomaza/waymark/commit/597262574ecfa29bfa2a927040067cfa81b6f35b))
* **mobile:** the launcher icon and the launch screen are the new mark ([e5b3a27](https://github.com/dariomaza/waymark/commit/e5b3a273c4d2ca7697861efaebe4c149c6f9cdde))
* **mobile:** the wait is the pin dropping onto the w ([4c27797](https://github.com/dariomaza/waymark/commit/4c27797fe6a95df401eae6dea9143e48cd6fc591))
* **ops:** the deploy can ship background removal ([05bad89](https://github.com/dariomaza/waymark/commit/05bad89c5e18c8a45ddf07522a68f4f247d6d161))
* **tokens:** a drawing can be set in type ([80d2f61](https://github.com/dariomaza/waymark/commit/80d2f618f49f36fe1e0cfce82a9fbaaf0214cee9))
* **tokens:** a scheme can be chosen, and the mark has a colour of its own ([a2652a9](https://github.com/dariomaza/waymark/commit/a2652a90a84504e892cbe198e8815f061498f6a5))
* **tokens:** the mark and the logo are written once, for both clients ([a8dfbdc](https://github.com/dariomaza/waymark/commit/a8dfbdcbc7ba9dbf2c69bb67256d22ba4c9bc60b))
* **tokens:** the symbol and the clock the wait is drawn from ([82ff805](https://github.com/dariomaza/waymark/commit/82ff8059130ddf02aa2630e314889d41b77a9999))
* **web:** the account screen chooses light, dark or the device's scheme ([cfdb4e4](https://github.com/dariomaza/waymark/commit/cfdb4e4fa409d024eb81c97e3022ba26f6f55bf4))
* **web:** the console signs with the mark ([03a5037](https://github.com/dariomaza/waymark/commit/03a50376271829191079b464edcbbbffe68b8e0c))
* **web:** the favicon and the installed app's icons are the new mark ([6f95612](https://github.com/dariomaza/waymark/commit/6f95612aa0f047cb54b32ed84af449aa081f65c1))
* **web:** the top bar draws the name as the logo, and the mark is the w with the pin ([a3896a1](https://github.com/dariomaza/waymark/commit/a3896a11081c6953f7877a1440037e4d3ef0c9bb))
* **web:** the wait is the pin dropping onto the w ([db175e0](https://github.com/dariomaza/waymark/commit/db175e0f0df097a94feab4e83bb569cfbbd78178))


### Bug Fixes

* **i18n:** the Spanish account lede says what the screen holds in few words ([c003d79](https://github.com/dariomaza/waymark/commit/c003d796084e5a0c964f613d95ef00c7ab44e0ca))
* **ops:** the API in the host namespace reaches the background-removal sidecar ([3ca02ab](https://github.com/dariomaza/waymark/commit/3ca02ab098add7690defcdad48fe350710195046))
