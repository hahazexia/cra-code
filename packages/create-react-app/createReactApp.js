/**
 * Copyright (c) 2015-present, Facebook, Inc.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

// ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
//   /!\ DO NOT MODIFY THIS FILE /!\
// ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
//
// The only job of create-react-app is to init the repository and then
// forward all the commands to the local version of create-react-app.
//
// If you need to add a new command, please add it to the scripts/ folder.
//
// The only reason to modify this file is to add more warnings and
// troubleshooting information for the `create-react-app` command.
//
// Do not make breaking changes! We absolutely don't want to have to
// tell people to update their global version of create-react-app.
//
// Also be careful with new language features.
// This file must work on Node 10+.
//
// ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
//   /!\ DO NOT MODIFY THIS FILE /!\
// ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

'use strict';

const https = require('https');
const chalk = require('chalk');
const commander = require('commander');
const dns = require('dns');
const envinfo = require('envinfo');
const execSync = require('child_process').execSync;
const fs = require('fs-extra');
const hyperquest = require('hyperquest');
const prompts = require('prompts');
const os = require('os');
const path = require('path');
const semver = require('semver');
const spawn = require('cross-spawn');
const tmp = require('tmp');
const unpack = require('tar-pack').unpack;
const url = require('url');
const validateProjectName = require('validate-npm-package-name');

const packageJson = require('./package.json');

let projectName;

function init() {
  // 命令的名字就是 create-react-app
  const program = new commander.Command(packageJson.name)

    // 设置 create-react-app 工具版本号
    .version(packageJson.version)

    // 设置 create-react-app 命令参数，只有一个必选参数 项目目录
    .arguments('<project-directory>')

    // 帮助信息的首行会显示：Usage: create-react-app <project-directory> [options]
    .usage(`${chalk.green('<project-directory>')} [options]`)

    // 命令处理函数的参数 name 是 create-react-app 命令输入的 <project-directory> 参数
    // 将 <project-directory> 保存到全局变量 projectName
    .action(name => {
      projectName = name;
    })

    // --verbose 打印额外的日志
    .option('--verbose', 'print additional logs')

    // --info 打印与环境相关的 debug 信息
    .option('--info', 'print environment debug info')
    
    // --scripts-version 指定一个非标准的 react-scripts
    // react-scripts 就是被隐藏起来的 webpack 配置和脚本
    .option(
      '--scripts-version <alternative-package>',
      'use a non-standard version of react-scripts'
    )

    // --template 为创建的项目指定一个模板
    // 这里的模板就是指一个项目源代码目录，包括 src，public等目录和代码文件
    // 根据 create-react-app 官方文档，一个 template 必须包含以下文件
    /**
     * cra-template-[template-name]/
        README.md (for npm)
        template.json
        package.json
        template/
          README.md (for projects created from this template)
          gitignore
          public/
            index.html
          src/
            index.js (or index.tsx)
     */
    // create-react-app 官方提供的两个默认 template 为
    // 1. cra-template https://github.com/facebook/create-react-app/tree/master/packages/cra-template
    // 2. cra-template-typescript https://github.com/facebook/create-react-app/tree/master/packages/cra-template-typescript
    .option(
      '--template <path-to-template>',
      'specify a template for the created project'
    )

    // --use-npm 默认情况下 create-react-app 默认使用 yarn 包管理器，想使用 npm 就在命令中加入 --use-npm
    .option('--use-npm')

    // 开启 yarn 包管理工具的 pnp 特性（Plug’n’Play）
    /**
     * yarn install 操作会执行以下 4 个步骤：

        1. 将依赖包的版本区间解析为某个具体的版本号
        2. 下载对应版本依赖的 tar 包到本地离线镜像
        3. 将依赖从离线镜像解压到本地缓存
        4. 将依赖从缓存拷贝到当前目录的 node_modules 目录

        其中第 4 步同样涉及大量的文件 I/O，导致安装依赖时效率不高（尤其是在 CI 环境，每次都需要安装全部依赖）

        pnp 特性就是：

        在第 3 步完成之后，Yarn 并不会拷贝依赖到 node_modules 目录，而是会在 .pnp.js 中记录下该依赖在缓存中的具体位置。这样就避免了大量的 I/O 操作同时项目目录也不会有 node_modules 目录生成。同时 .pnp.js 还包含了一个特殊的 resolver，Yarn 会利用这个特殊的 resolver 来处理 require() 请求，该 resolver 会根据 .pnp.js 文件中包含的静态映射表直接确定依赖在文件系统中的具体位置，从而避免了现有实现在处理依赖引用时的 I/O 操作。
     */
    .option('--use-pnp')

    // 允许使用未知的选项
    .allowUnknownOption()

    // 监听 --help 打印一些信息
    /**
     * 打印的其实是如下信息，告知 project-directory 参数是必须的，然后对 --scripts-version 和 --template 参数做了一些说明
    *   Only <project-directory> is required.

        A custom --scripts-version can be one of:
          - a specific npm version: 0.8.2
          - a specific npm tag: @next
          - a custom fork published on npm: my-react-scripts
          - a local path relative to the current working directory: file:../my-react-scripts
          - a .tgz archive: https://mysite.com/my-react-scripts-0.8.2.tgz
          - a .tar.gz archive: https://mysite.com/my-react-scripts-0.8.2.tar.gz
        It is not needed unless you specifically want to use a fork.

        A custom --template can be one of:
          - a custom template published on npm: cra-template-typescript
          - a local path relative to the current working directory: file:../my-custom-template
          - a .tgz archive: https://mysite.com/my-custom-template-0.8.2.tgz
          - a .tar.gz archive: https://mysite.com/my-custom-template-0.8.2.tar.gz

        If you have any problems, do not hesitate to file an issue:
        https://github.com/facebook/create-react-app/issues/new
     */
    .on('--help', () => {
      console.log(
        `    Only ${chalk.green('<project-directory>')} is required.`
      );
      console.log();
      console.log(
        `    A custom ${chalk.cyan('--scripts-version')} can be one of:`
      );
      console.log(`      - a specific npm version: ${chalk.green('0.8.2')}`);
      console.log(`      - a specific npm tag: ${chalk.green('@next')}`);
      console.log(
        `      - a custom fork published on npm: ${chalk.green(
          'my-react-scripts'
        )}`
      );
      console.log(
        `      - a local path relative to the current working directory: ${chalk.green(
          'file:../my-react-scripts'
        )}`
      );
      console.log(
        `      - a .tgz archive: ${chalk.green(
          'https://mysite.com/my-react-scripts-0.8.2.tgz'
        )}`
      );
      console.log(
        `      - a .tar.gz archive: ${chalk.green(
          'https://mysite.com/my-react-scripts-0.8.2.tar.gz'
        )}`
      );
      console.log(
        `    It is not needed unless you specifically want to use a fork.`
      );
      console.log();
      console.log(`    A custom ${chalk.cyan('--template')} can be one of:`);
      console.log(
        `      - a custom template published on npm: ${chalk.green(
          'cra-template-typescript'
        )}`
      );
      console.log(
        `      - a local path relative to the current working directory: ${chalk.green(
          'file:../my-custom-template'
        )}`
      );
      console.log(
        `      - a .tgz archive: ${chalk.green(
          'https://mysite.com/my-custom-template-0.8.2.tgz'
        )}`
      );
      console.log(
        `      - a .tar.gz archive: ${chalk.green(
          'https://mysite.com/my-custom-template-0.8.2.tar.gz'
        )}`
      );
      console.log();
      console.log(
        `    If you have any problems, do not hesitate to file an issue:`
      );
      console.log(
        `      ${chalk.cyan(
          'https://github.com/facebook/create-react-app/issues/new'
        )}`
      );
      console.log();
    })

    // 解析命令行参数，传入 parse 的参数需是一个字符串数组
    .parse(process.argv);
 
    // create-react-app --info 会输出一些有关环境的信息

    /**
     * Environment Info:

      current version of create-react-app: 4.0.3
      running from C:\Users\Administrator\AppData\Roaming\npm\node_modules\create-react-app

      System:
        OS: Windows 10 10.0.19042
        CPU: (8) ia32 Intel(R) Core(TM) i7-8550U CPU @ 1.80GHz
      Binaries:
        Node: 14.15.1 - C:\Program Files\nodejs\node.EXE
        Yarn: 1.22.10 - ~\AppData\Roaming\npm\yarn.CMD
        npm: 6.14.8 - C:\Program Files\nodejs\npm.CMD
      Browsers:
        Chrome: Not Found
        Edge: Spartan (44.19041.964.0), Chromium (91.0.864.48)
        Internet Explorer: 11.0.19041.1
      npmPackages:
        react: Not Found
        react-dom: Not Found
        react-scripts: Not Found
      npmGlobalPackages:
        create-react-app: Not Found
     */
  if (program.info) {
    console.log(chalk.bold('\nEnvironment Info:'));
    console.log(
      `\n  current version of ${packageJson.name}: ${packageJson.version}`
    );
    console.log(`  running from ${__dirname}`);
    return envinfo
      .run(
        {
          System: ['OS', 'CPU'],
          Binaries: ['Node', 'npm', 'Yarn'],
          Browsers: [
            'Chrome',
            'Edge',
            'Internet Explorer',
            'Firefox',
            'Safari',
          ],
          npmPackages: ['react', 'react-dom', 'react-scripts'],
          npmGlobalPackages: ['create-react-app'],
        },
        {
          duplicates: true,
          showNotFound: true,
        }
      )
      .then(console.log);
  }

  // 如果使用 create-react-app 命令时没有提供 <project-directory> 参数，提示错误并退出程序

  /**
   * Please specify the project directory:
      create-react-app <project-directory>

      For example:
        create-react-app my-react-app

      Run create-react-app --help to see all options.
   */
  if (typeof projectName === 'undefined') {
    console.error('Please specify the project directory:');
    console.log(
      `  ${chalk.cyan(program.name())} ${chalk.green('<project-directory>')}`
    );
    console.log();
    console.log('For example:');
    console.log(
      `  ${chalk.cyan(program.name())} ${chalk.green('my-react-app')}`
    );
    console.log();
    console.log(
      `Run ${chalk.cyan(`${program.name()} --help`)} to see all options.`
    );
    process.exit(1);
  }

  // We first check the registry directly via the API, and if that fails, we try
  // the slower `npm view [package] version` command.
  //
  // This is important for users in environments where direct access to npm is
  // blocked by a firewall, and packages are provided exclusively via a private
  // registry.

  // 先使用 checkForLatestVersion 函数请求接口获取 create-react-app 最新版本号
  checkForLatestVersion()
    .catch(() => {
      try {
        // 如果 checkForLatestVersion 请求失败，运行 npm view create-react-app version 命令获取最新版本号
        return execSync('npm view create-react-app version').toString().trim();
      } catch (e) {
        return null;
      }
    })
    .then(latest => {
      // 当前运行的 create-react-app 版本号小于最新版本号，就打印一些错误和提示信息然后退出程序
      if (latest && semver.lt(packageJson.version, latest)) {
        console.log();
        console.error(
          chalk.yellow(
            `You are running \`create-react-app\` ${packageJson.version}, which is behind the latest release (${latest}).\n\n` +
              'We no longer support global installation of Create React App.'
          )
        );
        console.log();
        console.log(
          'Please remove any global installs with one of the following commands:\n' +
            '- npm uninstall -g create-react-app\n' +
            '- yarn global remove create-react-app'
        );
        console.log();
        console.log(
          'The latest instructions for creating a new app can be found here:\n' +
            'https://create-react-app.dev/docs/getting-started/'
        );
        console.log();
        process.exit(1);
      } else {
        // 如果使用的是最新版 create-react-app ，调用 createApp 函数创建项目
        createApp(
          projectName,
          program.verbose,
          program.scriptsVersion,
          program.template,
          program.useNpm,
          program.usePnp
        );
      }
    });
}

/**
 * 对 node 版本，项目生成路径，npm 和 yarn 做一些校验工作，如果发现有错误就打印错误信息然后退出程序，如果没有错误就调用 run 方法继续执行创建工作
 * 这一步中会创建一个简单的 package.json 文件到项目路径下
 * 
 * @param {*} name create-react-app 命令输入的 <project-directory> 参数，项目的名字
 * @param {*} verbose 用户输入的 --verbose 是否输入额外日志信息
 * @param {*} version 用户使用 --scripts-version 参数指定的 react-scripts 的版本号
 * @param {*} template 用户设置的 template
 * @param {*} useNpm 是否使用 npm 包管理器
 * @param {*} usePnp 是否开启 yarn 的 pnp 特性（Plug’n’Play）
 */
function createApp(name, verbose, version, template, useNpm, usePnp) {
  // 判断 node 版本是否满足 >= 10
  const unsupportedNodeVersion = !semver.satisfies(
    // Coerce strings with metadata (i.e. `15.0.0-nightly`).
    // 强制转换 process.version 变为一个semver版本字符串
    semver.coerce(process.version),
    '>=10'
  );

  // 如果 node 版本小于 10 ，就使用低版本的 react-scripts
  if (unsupportedNodeVersion) {
    console.log(
      chalk.yellow(
        `You are using Node ${process.version} so the project will be bootstrapped with an old unsupported version of tools.\n\n` +
          `Please update to Node 10 or higher for a better, fully supported experience.\n`
      )
    );
    // Fall back to latest supported react-scripts on Node 4
    version = 'react-scripts@0.9.x';
  }

  // 将要生成项目的位置
  const root = path.resolve(name);
  // 新项目的名字
  const appName = path.basename(root);

  // 检查用户传入的项目名是否合法，如果不合法就打印错误信息然后退出程序
  checkAppName(appName);

  // 确保 name目录存在，如果不存在就创建
  fs.ensureDirSync(name);

  
  // 如果create-react-app新建项目的目录已经存在了，遍历目录中的所有文件，判断是否其中含有会造成冲突的文件
  // 如果存在会冲突的文件，就打印错误信息，然后退出程序
  if (!isSafeToCreateProjectIn(root, name)) {
    process.exit(1);
  }
  console.log();

  // 将在 root 目录下创建新 react 应用
  console.log(`Creating a new React app in ${chalk.green(root)}.`);
  console.log();

  // 将 packageJson 内容写入 root/package.json 文件中
  const packageJson = {
    name: appName,
    version: '0.1.0',
    private: true,
  };
  fs.writeFileSync(
    path.join(root, 'package.json'),
    JSON.stringify(packageJson, null, 2) + os.EOL
  );

  // 是否全局安装了 yarn 且用户没有输入 --use-npm
  const useYarn = useNpm ? false : shouldUseYarn();
  // 存下当前进程的工作目录
  const originalDirectory = process.cwd();
  // 将当前工作目录切换到 root，也就是新项目目录中
  process.chdir(root);

  // 如果使用 npm，检查 npm 是否能够读取 process.cwd() 当前工作目录，如果不能正常读取，打印错误信息然后退出程序  
  if (!useYarn && !checkThatNpmCanReadCwd()) {
    process.exit(1);
  }

  
  if (!useYarn) {
    // 使用 npm 的情况
    const npmInfo = checkNpmVersion();
    // 如果 npm 版本号小于等于 6.0.0，就将 react-scripts 版本号降级为 0.9.x
    if (!npmInfo.hasMinNpm) {
      if (npmInfo.npmVersion) {
        console.log(
          chalk.yellow(
            `You are using npm ${npmInfo.npmVersion} so the project will be bootstrapped with an old unsupported version of tools.\n\n` +
              `Please update to npm 6 or higher for a better, fully supported experience.\n`
          )
        );
      }
      // Fall back to latest supported react-scripts for npm 3
      version = 'react-scripts@0.9.x';
    }
  } else if (usePnp) {
    // 使用 yarn 开启 pnp 特性的情况
    const yarnInfo = checkYarnVersion();
    if (yarnInfo.yarnVersion) {
      // 如果 当前 yarn 版本小于最小 pnp 特性版本，则不能使用 pnp 特性，提示警告信息，然后将 usePnp 置为 false
      if (!yarnInfo.hasMinYarnPnp) {
        console.log(
          chalk.yellow(
            `You are using Yarn ${yarnInfo.yarnVersion} together with the --use-pnp flag, but Plug'n'Play is only supported starting from the 1.12 release.\n\n` +
              `Please update to Yarn 1.12 or higher for a better, fully supported experience.\n`
          )
        );
        // 1.11 had an issue with webpack-dev-middleware, so better not use PnP with it (never reached stable, but still)
        usePnp = false;
      }
      
      // 如果 当前 yarn 版本大于最大 pnp 特性版本，则不能使用 pnp 特性，提示警告信息，然后将 usePnp 置为 false
      if (!yarnInfo.hasMaxYarnPnp) {
        console.log(
          chalk.yellow(
            'The --use-pnp flag is no longer necessary with yarn 2 and will be deprecated and removed in a future release.\n'
          )
        );
        // 2 supports PnP by default and breaks when trying to use the flag
        usePnp = false;
      }
    }
  }

  if (useYarn) {
    let yarnUsesDefaultRegistry = true;
    try {
      // 判断当前 yarn 下载源地址是否是官方默认地址
      yarnUsesDefaultRegistry =
        execSync('yarnpkg config get registry').toString().trim() ===
        'https://registry.yarnpkg.com';
    } catch (e) {
      // ignore
    }
    if (yarnUsesDefaultRegistry) {
      // 如果 yarn 使用默认源，则将 yarn.lock.cached 缓存文件复制到当前新创建的项目目录下并改名为 yarn.lock
      fs.copySync(
        require.resolve('./yarn.lock.cached'),
        path.join(root, 'yarn.lock')
      );
    }
  }
  /**
   * root 将要新建的项目的绝对路径，其实就是 path.resolve(__dirname, appName)
   * appName 用户输入的项目名字
   * version react-scripts 的版本号
   * verbose 用户输入的 --verbose 是否输入额外日志信息
   * originalDirectory 创建以 appName 为名的项目文件夹之前所在的目录，也就是 root 的上一层目录
   * template 项目的模板，默认使用 cra-template 和 cra-template-typescript
   * useYarn 是否使用 yarn 包管理器
   * usePnp 是否开启 yarn 的 pnp 特性
   * 
   */
  run(
    root,
    appName,
    version,
    verbose,
    originalDirectory,
    template,
    useYarn,
    usePnp
  );
}

// 是否全局安装了 yarn
function shouldUseYarn() {
  try {
    // 运行终端命令 yarnpkg --version 获取全局安装的 yarn 包管理器版本号
    execSync('yarnpkg --version', { stdio: 'ignore' });
    return true;
  } catch (e) {
    return false;
  }
}

function install(root, useYarn, usePnp, dependencies, verbose, isOnline) {
  return new Promise((resolve, reject) => {
    let command;
    let args;
    if (useYarn) {
      command = 'yarnpkg';
      args = ['add', '--exact'];
      if (!isOnline) {
        args.push('--offline');
      }
      if (usePnp) {
        args.push('--enable-pnp');
      }
      [].push.apply(args, dependencies);

      // Explicitly set cwd() to work around issues like
      // https://github.com/facebook/create-react-app/issues/3326.
      // Unfortunately we can only do this for Yarn because npm support for
      // equivalent --prefix flag doesn't help with this issue.
      // This is why for npm, we run checkThatNpmCanReadCwd() early instead.
      args.push('--cwd');
      args.push(root);

      if (!isOnline) {
        console.log(chalk.yellow('You appear to be offline.'));
        console.log(chalk.yellow('Falling back to the local Yarn cache.'));
        console.log();
      }
    } else {
      command = 'npm';
      args = [
        'install',
        '--save',
        '--save-exact',
        '--loglevel',
        'error',
      ].concat(dependencies);

      if (usePnp) {
        console.log(chalk.yellow("NPM doesn't support PnP."));
        console.log(chalk.yellow('Falling back to the regular installs.'));
        console.log();
      }
    }

    if (verbose) {
      args.push('--verbose');
    }

    const child = spawn(command, args, { stdio: 'inherit' });
    child.on('close', code => {
      if (code !== 0) {
        reject({
          command: `${command} ${args.join(' ')}`,
        });
        return;
      }
      resolve();
    });
  });
}

/**
 *
 * @param {*} root 将要新建的项目的绝对路径，其实就是 path.resolve(__dirname, appName)
 * @param {*} appName 用户输入的项目名字
 * @param {*} version 用户通过 --scripts-version 指定的 react-scripts
 * @param {*} verbose 用户输入的 --verbose 是否输入额外日志信息
 * @param {*} originalDirectory 创建以 appName 为名的项目文件夹之前所在的目录，也就是 root 的上一层目录
 * @param {*} template 项目的模板，默认使用 cra-template 和 cra-template-typescript
 * @param {*} useYarn 是否使用 yarn 包管理器
 * @param {*} usePnp 是否开启 yarn 的 pnp 特性
 */
function run(
  root,
  appName,
  version,
  verbose,
  originalDirectory,
  template,
  useYarn,
  usePnp
) {
  // 处理 react-scripts 和 template，因为这两个参数都有可能自定义，生成最终要使用的依赖包名
  Promise.all([
    getInstallPackage(version, originalDirectory),
    getTemplateInstallPackage(template, originalDirectory),
  ]).then(([packageToInstall, templateToInstall]) => {
    // 要安装的依赖 react react-dom react-scripts
    const allDependencies = ['react', 'react-dom', packageToInstall];

    console.log('Installing packages. This might take a couple of minutes.');

    // 提取 react-scripts 和 template 的包名信息
    Promise.all([
      getPackageInfo(packageToInstall),
      getPackageInfo(templateToInstall),
    ])
      .then(([packageInfo, templateInfo]) =>
        // 检查当前网络状况是否良好，可以访问 yarn 源
        checkIfOnline(useYarn).then(isOnline => ({
          isOnline,
          packageInfo,
          templateInfo,
        }))
      )
      .then(({ isOnline, packageInfo, templateInfo }) => {
        let packageVersion = semver.coerce(packageInfo.version);

        const templatesVersionMinimum = '3.3.0';

        // Assume compatibility if we can't test the version.
        if (!semver.valid(packageVersion)) {
          packageVersion = templatesVersionMinimum;
        }

        // Only support templates when used alongside new react-scripts versions.
        const supportsTemplates = semver.gte(
          packageVersion,
          templatesVersionMinimum
        );
        if (supportsTemplates) {
          allDependencies.push(templateToInstall);
        } else if (template) {
          console.log('');
          console.log(
            `The ${chalk.cyan(packageInfo.name)} version you're using ${
              packageInfo.name === 'react-scripts' ? 'is not' : 'may not be'
            } compatible with the ${chalk.cyan('--template')} option.`
          );
          console.log('');
        }

        console.log(
          `Installing ${chalk.cyan('react')}, ${chalk.cyan(
            'react-dom'
          )}, and ${chalk.cyan(packageInfo.name)}${
            supportsTemplates ? ` with ${chalk.cyan(templateInfo.name)}` : ''
          }...`
        );
        console.log();

        return install(
          root,
          useYarn,
          usePnp,
          allDependencies,
          verbose,
          isOnline
        ).then(() => ({
          packageInfo,
          supportsTemplates,
          templateInfo,
        }));
      })
      .then(async ({ packageInfo, supportsTemplates, templateInfo }) => {
        const packageName = packageInfo.name;
        const templateName = supportsTemplates ? templateInfo.name : undefined;
        checkNodeVersion(packageName);
        setCaretRangeForRuntimeDeps(packageName);

        const pnpPath = path.resolve(process.cwd(), '.pnp.js');

        const nodeArgs = fs.existsSync(pnpPath) ? ['--require', pnpPath] : [];

        await executeNodeScript(
          {
            cwd: process.cwd(),
            args: nodeArgs,
          },
          [root, appName, verbose, originalDirectory, templateName],
          `
        var init = require('${packageName}/scripts/init.js');
        init.apply(null, JSON.parse(process.argv[1]));
      `
        );

        if (version === 'react-scripts@0.9.x') {
          console.log(
            chalk.yellow(
              `\nNote: the project was bootstrapped with an old unsupported version of tools.\n` +
                `Please update to Node >=10 and npm >=6 to get supported tools in new projects.\n`
            )
          );
        }
      })
      .catch(reason => {
        console.log();
        console.log('Aborting installation.');
        if (reason.command) {
          console.log(`  ${chalk.cyan(reason.command)} has failed.`);
        } else {
          console.log(
            chalk.red('Unexpected error. Please report it as a bug:')
          );
          console.log(reason);
        }
        console.log();

        // On 'exit' we will delete these files from target directory.
        const knownGeneratedFiles = [
          'package.json',
          'yarn.lock',
          'node_modules',
        ];
        const currentFiles = fs.readdirSync(path.join(root));
        currentFiles.forEach(file => {
          knownGeneratedFiles.forEach(fileToMatch => {
            // This removes all knownGeneratedFiles.
            if (file === fileToMatch) {
              console.log(`Deleting generated file... ${chalk.cyan(file)}`);
              fs.removeSync(path.join(root, file));
            }
          });
        });
        const remainingFiles = fs.readdirSync(path.join(root));
        if (!remainingFiles.length) {
          // Delete target folder if empty
          console.log(
            `Deleting ${chalk.cyan(`${appName}/`)} from ${chalk.cyan(
              path.resolve(root, '..')
            )}`
          );
          process.chdir(path.resolve(root, '..'));
          fs.removeSync(path.join(root));
        }
        console.log('Done.');
        process.exit(1);
      });
  });
}

// 处理 react-scripts 版本，因为用户可以通过 --scripts-version 参数指定自定义的 react-scripts
// 返回 'react-scripts@x.x.x' 形式的字符串
function getInstallPackage(version, originalDirectory) {
  // 处理将要安装的 react-scripts 版本为 'react-scripts@x.x.x' 的形式
  let packageToInstall = 'react-scripts';
  const validSemver = semver.valid(version);
  if (validSemver) {
    // 默认情况下为 'react-scripts@x.x.x' 形式
    packageToInstall += `@${validSemver}`;
  } else if (version) {
    if (version[0] === '@' && !version.includes('/')) {
      packageToInstall += version;
    } else if (version.match(/^file:/)) {
      // 如果 version 是文件形式
      packageToInstall = `file:${path.resolve(
        originalDirectory,
        version.match(/^file:(.*)?$/)[1]
      )}`;
    } else {
      // for tar.gz or alternative paths
      packageToInstall = version;
    }
  }

  const scriptsToWarn = [
    {
      name: 'react-scripts-ts',
      message: chalk.yellow(
        `The react-scripts-ts package is deprecated. TypeScript is now supported natively in Create React App. You can use the ${chalk.green(
          '--template typescript'
        )} option instead when generating your app to include TypeScript support. Would you like to continue using react-scripts-ts?`
      ),
    },
  ];

  for (const script of scriptsToWarn) {
    // 如果用户指定的 react-scripts 是 react-scripts-ts，则打印提示并让用户做选择是否继续使用 react-scripts-ts
    // react-scripts-ts 包已经废弃，create-react-app 已经原生支持 ts 了，可以使用 --template typescript 参数来支持 ts 
    if (packageToInstall.startsWith(script.name)) {
      return prompts({
        type: 'confirm',
        name: 'useScript',
        message: script.message,
        initial: false,
      }).then(answer => {
        if (!answer.useScript) {
          process.exit(0);
        }

        return packageToInstall;
      });
    }
  }

  return Promise.resolve(packageToInstall);
}

// 处理 template，因为用户可以通过 --template 参数指定自定义模板
function getTemplateInstallPackage(template, originalDirectory) {
  let templateToInstall = 'cra-template';
  if (template) {
    if (template.match(/^file:/)) {
      // 如果 template 是一个文件协议字符串，就计算出的绝对路径
      templateToInstall = `file:${path.resolve(
        originalDirectory,
        template.match(/^file:(.*)?$/)[1]
      )}`;
    } else if (
      template.includes('://') ||
      template.match(/^.+\.(tgz|tar\.gz)$/)
    ) {
      // for tar.gz or alternative paths
      templateToInstall = template;
    } else {
      // Add prefix 'cra-template-' to non-prefixed templates, leaving any
      // @scope/ and @version intact.
      // 利用正则获取到这个包的 scope name version，然后拼成最终的 template 包名
      const packageMatch = template.match(/^(@[^/]+\/)?([^@]+)?(@.+)?$/);
      const scope = packageMatch[1] || '';
      const templateName = packageMatch[2] || '';
      const version = packageMatch[3] || '';

      if (
        templateName === templateToInstall ||
        templateName.startsWith(`${templateToInstall}-`)
      ) {
        // Covers:
        // - cra-template
        // - @SCOPE/cra-template
        // - cra-template-NAME
        // - @SCOPE/cra-template-NAME
        templateToInstall = `${scope}${templateName}${version}`;
      } else if (version && !scope && !templateName) {
        // Covers using @SCOPE only
        templateToInstall = `${version}/${templateToInstall}`;
      } else {
        // Covers templates without the `cra-template` prefix:
        // - NAME
        // - @SCOPE/NAME
        templateToInstall = `${scope}${templateToInstall}-${templateName}${version}`;
      }
    }
  }

  return Promise.resolve(templateToInstall);
}

// 异步创建一个临时文件夹
function getTemporaryDirectory() {
  return new Promise((resolve, reject) => {
    // Unsafe cleanup lets us recursively delete the directory if it contains
    // contents; by default it only allows removal if it's empty
    tmp.dir({ unsafeCleanup: true }, (err, tmpdir, callback) => {
      if (err) {
        reject(err);
      } else {
        resolve({
          // 临时目录的绝对路径
          tmpdir: tmpdir,
          // 用于手动清除这个临时目录
          cleanup: () => {
            try {
              callback();
            } catch (ignored) {
              // Callback might throw and fail, since it's a temp directory the
              // OS will clean it up eventually...
            }
          },
        });
      }
    });
  });
}

// 解压 tar 包到指定目录
function extractStream(stream, dest) {
  return new Promise((resolve, reject) => {
    stream.pipe(
      unpack(dest, err => {
        if (err) {
          reject(err);
        } else {
          resolve(dest);
        }
      })
    );
  });
}

// Extract package name from tarball url or path.
// 从包的安装url中提取包名
function getPackageInfo(installPackage) {
  if (installPackage.match(/^.+\.(tgz|tar\.gz)$/)) {
    // tar 包处理
    // 创建一个临时目录，然后判断 tar 包是一个 http 的 url 还是本地地址。如果是 http 地址就将其下载到临时目录中，然后将其解压，否则直接读取，然后得到 package.json 中的 name 和 version 后返回
    return getTemporaryDirectory()
      .then(obj => {
        let stream;
        if (/^http/.test(installPackage)) {
          stream = hyperquest(installPackage);
        } else {
          stream = fs.createReadStream(installPackage);
        }
        return extractStream(stream, obj.tmpdir).then(() => obj);
      })
      .then(obj => {
        const { name, version } = require(path.join(
          obj.tmpdir,
          'package.json'
        ));
        obj.cleanup();
        return { name, version };
      })
      .catch(err => {
        // 如果无法从 tar 包中提取 semver 版本号，就根据 installPackage url 生成一个假想的版本号的名字返回
        // The package name could be with or without semver version, e.g. react-scripts-0.2.0-alpha.1.tgz
        // However, this function returns package name only without semver version.
        console.log(
          `Could not extract the package name from the archive: ${err.message}`
        );
        const assumedProjectName = installPackage.match(
          /^.+\/(.+?)(?:-\d+.+)?\.(tgz|tar\.gz)$/
        )[1];
        console.log(
          `Based on the filename, assuming it is "${chalk.cyan(
            assumedProjectName
          )}"`
        );
        return Promise.resolve({ name: assumedProjectName });
      });
  } else if (installPackage.startsWith('git+')) {
    // git+ 开头的url直接正则提取包名
    // Pull package name out of git urls e.g:
    // git+https://github.com/mycompany/react-scripts.git
    // git+ssh://github.com/mycompany/react-scripts.git#v1.2.3
    return Promise.resolve({
      name: installPackage.match(/([^/]+)\.git(#.*)?$/)[1],
    });
  } else if (installPackage.match(/.+@/)) {
    // Do not match @scope/ when stripping off @version or @tag
    // @scope name@version 的形式直接正则获取 name 和 version
    return Promise.resolve({
      name: installPackage.charAt(0) + installPackage.substr(1).split('@')[0],
      version: installPackage.split('@')[1],
    });
  } else if (installPackage.match(/^file:/)) {
    // file协议的url 从其位置中的 package.json 中获取 name 和 version
    const installPackagePath = installPackage.match(/^file:(.*)?$/)[1];
    const { name, version } = require(path.join(
      installPackagePath,
      'package.json'
    ));
    return Promise.resolve({ name, version });
  }
  return Promise.resolve({ name: installPackage });
}

// 检查 npm 版本
function checkNpmVersion() {
  let hasMinNpm = false;
  let npmVersion = null;
  try {
    // npm 版本号
    npmVersion = execSync('npm --version').toString().trim();
    // npm 版本号是否大于等于 6.0.0
    hasMinNpm = semver.gte(npmVersion, '6.0.0');
  } catch (err) {
    // ignore
  }
  return {
    hasMinNpm: hasMinNpm,
    npmVersion: npmVersion,
  };
}

// 检查 yarn 版本号
function checkYarnVersion() {
  const minYarnPnp = '1.12.0';
  const maxYarnPnp = '2.0.0';
  let hasMinYarnPnp = false;
  let hasMaxYarnPnp = false;
  let yarnVersion = null;
  try {
    // 获取 yarn 版本号
    yarnVersion = execSync('yarnpkg --version').toString().trim();
    if (semver.valid(yarnVersion)) {
      // 判断当前yarn版本是否在最小php特性版本和最大pnp特性版本之间
      hasMinYarnPnp = semver.gte(yarnVersion, minYarnPnp);
      hasMaxYarnPnp = semver.lt(yarnVersion, maxYarnPnp);
    } else {
      // Handle non-semver compliant yarn version strings, which yarn currently
      // uses for nightly builds. The regex truncates anything after the first
      // dash. See #5362.
      // 处理 yarn 版本号字符串不兼容 semver 的情况
      const trimmedYarnVersionMatch = /^(.+?)[-+].+$/.exec(yarnVersion);
      if (trimmedYarnVersionMatch) {
        const trimmedYarnVersion = trimmedYarnVersionMatch.pop();
        hasMinYarnPnp = semver.gte(trimmedYarnVersion, minYarnPnp);
        hasMaxYarnPnp = semver.lt(trimmedYarnVersion, maxYarnPnp);
      }
    }
  } catch (err) {
    // ignore
  }
  return {
    hasMinYarnPnp: hasMinYarnPnp,
    hasMaxYarnPnp: hasMaxYarnPnp,
    yarnVersion: yarnVersion,
  };
}

function checkNodeVersion(packageName) {
  const packageJsonPath = path.resolve(
    process.cwd(),
    'node_modules',
    packageName,
    'package.json'
  );

  if (!fs.existsSync(packageJsonPath)) {
    return;
  }

  const packageJson = require(packageJsonPath);
  if (!packageJson.engines || !packageJson.engines.node) {
    return;
  }

  if (!semver.satisfies(process.version, packageJson.engines.node)) {
    console.error(
      chalk.red(
        'You are running Node %s.\n' +
          'Create React App requires Node %s or higher. \n' +
          'Please update your version of Node.'
      ),
      process.version,
      packageJson.engines.node
    );
    process.exit(1);
  }
}

// 检查新项目名字是否合法，如果不合法会打印报错信息然后退出程序
function checkAppName(appName) {
  // 判断 appName 是否是一个有效的 npm 包名
  const validationResult = validateProjectName(appName);

  // 如果包名是非法的，打印提示信息然后退出程序
  if (!validationResult.validForNewPackages) {
    console.error(
      chalk.red(
        `Cannot create a project named ${chalk.green(
          `"${appName}"`
        )} because of npm naming restrictions:\n`
      )
    );
    [
      ...(validationResult.errors || []),
      ...(validationResult.warnings || []),
    ].forEach(error => {
      console.error(chalk.red(`  * ${error}`));
    });
    console.error(chalk.red('\nPlease choose a different project name.'));
    process.exit(1);
  }

  // TODO: there should be a single place that holds the dependencies
  // 包名不能是 react react-dom react-scripts，如果是这三个其中之一，就打印报错信息，然后退出程序
  const dependencies = ['react', 'react-dom', 'react-scripts'].sort();
  if (dependencies.includes(appName)) {
    console.error(
      chalk.red(
        `Cannot create a project named ${chalk.green(
          `"${appName}"`
        )} because a dependency with the same name exists.\n` +
          `Due to the way npm works, the following names are not allowed:\n\n`
      ) +
        chalk.cyan(dependencies.map(depName => `  ${depName}`).join('\n')) +
        chalk.red('\n\nPlease choose a different project name.')
    );
    process.exit(1);
  }
}

function makeCaretRange(dependencies, name) {
  const version = dependencies[name];

  if (typeof version === 'undefined') {
    console.error(chalk.red(`Missing ${name} dependency in package.json`));
    process.exit(1);
  }

  let patchedVersion = `^${version}`;

  if (!semver.validRange(patchedVersion)) {
    console.error(
      `Unable to patch ${name} dependency version because version ${chalk.red(
        version
      )} will become invalid ${chalk.red(patchedVersion)}`
    );
    patchedVersion = version;
  }

  dependencies[name] = patchedVersion;
}

function setCaretRangeForRuntimeDeps(packageName) {
  const packagePath = path.join(process.cwd(), 'package.json');
  const packageJson = require(packagePath);

  if (typeof packageJson.dependencies === 'undefined') {
    console.error(chalk.red('Missing dependencies in package.json'));
    process.exit(1);
  }

  const packageVersion = packageJson.dependencies[packageName];
  if (typeof packageVersion === 'undefined') {
    console.error(chalk.red(`Unable to find ${packageName} in package.json`));
    process.exit(1);
  }

  makeCaretRange(packageJson.dependencies, 'react');
  makeCaretRange(packageJson.dependencies, 'react-dom');

  fs.writeFileSync(packagePath, JSON.stringify(packageJson, null, 2) + os.EOL);
}

// If project only contains files generated by GH, it’s safe.
// Also, if project contains remnant error logs from a previous
// installation, lets remove them now.
// We also special case IJ-based products .idea because it integrates with CRA:
// https://github.com/facebook/create-react-app/pull/368#issuecomment-243446094
// 如果create-react-app新建项目的目录已经存在了，遍历目录中的所有文件，判断是否其中含有会造成冲突的文件
function isSafeToCreateProjectIn(root, name) {
  // 新项目目录下可能存在的文件，这些文件是有效文件，不应该被删除
  const validFiles = [
    '.DS_Store',
    '.git',
    '.gitattributes',
    '.gitignore',
    '.gitlab-ci.yml',
    '.hg',
    '.hgcheck',
    '.hgignore',
    '.idea',
    '.npmignore',
    '.travis.yml',
    'docs',
    'LICENSE',
    'README.md',
    'mkdocs.yml',
    'Thumbs.db',
  ];
  // These files should be allowed to remain on a failed install, but then
  // silently removed during the next create.
  // 以下错误日志文件会被保留，而在下一次创建新项目时会被静默删除
  const errorLogFilePatterns = [
    'npm-debug.log',
    'yarn-error.log',
    'yarn-debug.log',
  ];
  // 判断文件是否包含包管理器错误日志
  const isErrorLog = file => {
    return errorLogFilePatterns.some(pattern => file.startsWith(pattern));
  };

  // 读取 root 目录下所有文件，过滤掉不会引起冲突的文件
  // 不会引起冲突的文件包含三种：有效文件，包管理器错误文件，编辑器的工程配置文件
  const conflicts = fs
    .readdirSync(root)
    // 过滤掉所有有效文件
    .filter(file => !validFiles.includes(file))
    // IntelliJ IDEA creates module files before CRA is launched
    // 过滤掉 IntelliJ IDEA 生成的工程配置文件
    .filter(file => !/\.iml$/.test(file))
    // Don't treat log files from previous installation as conflicts
    // 过滤掉包管理器错误日志文件
    .filter(file => !isErrorLog(file));

    // 如果包含可能会造成冲突的文件，则打印错误信息，然后返回 false
  if (conflicts.length > 0) {
    console.log(
      `The directory ${chalk.green(name)} contains files that could conflict:`
    );
    console.log();
    for (const file of conflicts) {
      try {
        const stats = fs.lstatSync(path.join(root, file));
        if (stats.isDirectory()) {
          console.log(`  ${chalk.blue(`${file}/`)}`);
        } else {
          console.log(`  ${file}`);
        }
      } catch (e) {
        console.log(`  ${file}`);
      }
    }
    console.log();
    console.log(
      'Either try using a new directory name, or remove the files listed above.'
    );

    return false;
  }

  // Remove any log files from a previous installation.
  // 移除所有包管理器错误日志
  fs.readdirSync(root).forEach(file => {
    if (isErrorLog(file)) {
      fs.removeSync(path.join(root, file));
    }
  });
  return true;
}

// 获取 https 代理地址
function getProxy() {
  if (process.env.https_proxy) {
    return process.env.https_proxy;
  } else {
    try {
      // Trying to read https-proxy from .npmrc
      let httpsProxy = execSync('npm config get https-proxy').toString().trim();
      return httpsProxy !== 'null' ? httpsProxy : undefined;
    } catch (e) {
      return;
    }
  }
}

// See https://github.com/facebook/create-react-app/pull/3355
// 检查 npm 是否能够读取 process.cwd() 当前工作目录
// 原理是执行命令 npm config list，然后将此命令的输出中的 cwd 行截取出来和 process.cwd() 对比，如果相等，则说明可以读取当前工作目录
function checkThatNpmCanReadCwd() {
  const cwd = process.cwd();
  let childOutput = null;
  try {
    // Note: intentionally using spawn over exec since
    // the problem doesn't reproduce otherwise.
    // `npm config list` is the only reliable way I could find
    // to reproduce the wrong path. Just printing process.cwd()
    // in a Node process was not enough.
    // 执行 npm config list 命令，拿到输出值
    childOutput = spawn.sync('npm', ['config', 'list']).output.join('');
  } catch (err) {
    // Something went wrong spawning node.
    // Not great, but it means we can't do this check.
    // We might fail later on, but let's continue.
    return true;
  }
  if (typeof childOutput !== 'string') {
    return true;
  }

  // 获取到 cwd 那一行的字符串
  const lines = childOutput.split('\n');
  // `npm config list` output includes the following line:
  // "; cwd = C:\path\to\current\dir" (unquoted)
  // I couldn't find an easier way to get it.
  const prefix = '; cwd = ';
  const line = lines.find(line => line.startsWith(prefix));
  if (typeof line !== 'string') {
    // Fail gracefully. They could remove it.
    return true;
  }
  const npmCWD = line.substring(prefix.length);

  // 判断 npm config list 输出中的 cwd 是否和 process.cwd() 相等
  // 相等则说明 npm 命令可以在当前工作目录正常运行，返回true，否则返回 false
  if (npmCWD === cwd) {
    return true;
  }
  console.error(
    chalk.red(
      `Could not start an npm process in the right directory.\n\n` +
        `The current directory is: ${chalk.bold(cwd)}\n` +
        `However, a newly started npm process runs in: ${chalk.bold(
          npmCWD
        )}\n\n` +
        `This is probably caused by a misconfigured system terminal shell.`
    )
  );
  if (process.platform === 'win32') {
    console.error(
      chalk.red(`On Windows, this can usually be fixed by running:\n\n`) +
        `  ${chalk.cyan(
          'reg'
        )} delete "HKCU\\Software\\Microsoft\\Command Processor" /v AutoRun /f\n` +
        `  ${chalk.cyan(
          'reg'
        )} delete "HKLM\\Software\\Microsoft\\Command Processor" /v AutoRun /f\n\n` +
        chalk.red(`Try to run the above two lines in the terminal.\n`) +
        chalk.red(
          `To learn more about this problem, read: https://blogs.msdn.microsoft.com/oldnewthing/20071121-00/?p=24433/`
        )
    );
  }
  return false;
}

// 判断当前网络是否可以正常装包
function checkIfOnline(useYarn) {
  // 如果不使用 yarn 不去 ping yarn 的源了直接返回 true，假设是最好的情况
  if (!useYarn) {
    // Don't ping the Yarn registry.
    // We'll just assume the best case.
    return Promise.resolve(true);
  }

  return new Promise(resolve => {
    // 使用 dns 模块解析出 yarn 源的 ip 地址
    dns.lookup('registry.yarnpkg.com', err => {
      let proxy;
      // 如果设置了代理，就去解析代理的地址
      if (err != null && (proxy = getProxy())) {
        // If a proxy is defined, we likely can't resolve external hostnames.
        // Try to resolve the proxy name as an indication of a connection.
        dns.lookup(url.parse(proxy).hostname, proxyErr => {
          resolve(proxyErr == null);
        });
      } else {
        resolve(err == null);
      }
    });
  });
}

function executeNodeScript({ cwd, args }, data, source) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [...args, '-e', source, '--', JSON.stringify(data)],
      { cwd, stdio: 'inherit' }
    );

    child.on('close', code => {
      if (code !== 0) {
        reject({
          command: `node ${args.join(' ')}`,
        });
        return;
      }
      resolve();
    });
  });
}

// 请求接口获取 create-react-app 最新版本号
function checkForLatestVersion() {
  return new Promise((resolve, reject) => {
    https
      .get(
        'https://registry.npmjs.org/-/package/create-react-app/dist-tags',
        res => {
          if (res.statusCode === 200) {
            let body = '';
            res.on('data', data => (body += data));
            res.on('end', () => {
              resolve(JSON.parse(body).latest);
            });
          } else {
            reject();
          }
        }
      )
      .on('error', () => {
        reject();
      });
  });
}

module.exports = {
  init,
  getTemplateInstallPackage,
};
