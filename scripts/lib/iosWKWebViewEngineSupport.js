/*
Helper class to work with Swift.
Mainly, it has only two method: to activate and to deactivate swift support in the project.
Edited
*/

var path = require('path');
var fs = require('fs');
var strFormat = require('util').format;
var COMMENT_KEY = /_comment$/;
var WKWEBVIEW_PLUGIN_NAME = 'cordova-plugin-wkwebview-engine';
var WKWEBVIEW_MACRO = 'WK_WEBVIEW_ENGINE_IS_USED';
var isWkWebViewEngineUsed = 0;
var context;
var projectRoot;
var iosPlatformPath;

module.exports = {
  setWKWebViewEngineMacro: setWKWebViewEngineMacro
};

/**
 * Define preprocessor macro for WKWebViewEngine.
 *
 * @param {Object} cordovaContext - cordova context
 */
function setWKWebViewEngineMacro(cordovaContext) {
  init(cordovaContext);

  // injecting options in project file
  var projectFile = loadProjectFile();
  setMacro(projectFile.xcode);
  projectFile.write();
}

// region General private methods

/**
 * Initialize before execution.
 *
 * @param {Object} ctx - cordova context instance
 */
function init(ctx) {
  context = ctx;
  projectRoot = ctx.opts.projectRoot;
  iosPlatformPath = path.join(projectRoot, 'platforms', 'ios');

  var wkWebViewPluginPath = path.join(projectRoot, 'plugins', WKWEBVIEW_PLUGIN_NAME);
  isWkWebViewEngineUsed = isDirectoryExists(wkWebViewPluginPath) ? 1 : 0;
}

function isDirectoryExists(dir) {
  var exists = false;
  try {
    fs.accessSync(dir, fs.F_OK);
    exists = true;
  } catch(err) {
  }

  return exists;
}

/**
 * Load iOS project file from platform specific folder.
 *
 * @return {Object} projectFile - project file information
 */
function loadProjectFile() {
  var platform_ios;
  var projectFile;

  try {
    // try pre-5.0 cordova structure
    platform_ios = require('cordova-lib/src/plugman/platforms')['ios'];
    projectFile = platform_ios.parseProjectFile(iosPlatformPath);
  } catch (e) {
      try {
          // let's try cordova 5.0 structure
          platform_ios = require('cordova-lib/src/plugman/platforms/ios');
          projectFile = platform_ios.parseProjectFile(iosPlatformPath);
      } catch (e) {
          // Then cordova 7.0
          var project_files = require('glob')
            .sync(path.join(iosPlatformPath, '*.xcodeproj', 'project.pbxproj'));

          if (project_files.length === 0) {
            throw new Error('does not appear to be an xcode project (no xcode project file)');
          }

          var pbxPath = project_files[0];

          var xcodeproj = require('xcode').project(pbxPath);
          xcodeproj.parseSync();

          projectFile = {
              'xcode': xcodeproj,
              write: function () {
                  var fs = require('fs');

              var frameworks_file = path.join(iosPlatformPath, 'frameworks.json');
              var frameworks = {};
              try {
                  frameworks = require(frameworks_file);
              } catch (e) { }

              fs.writeFileSync(pbxPath, xcodeproj.writeSync());
                  if (Object.keys(frameworks).length === 0) {
                      // If there is no framework references remain in the project, just remove this file
                      require('shelljs').rm('-rf', frameworks_file);
                      return;
                  }
                  fs.writeFileSync(frameworks_file, JSON.stringify(this.frameworks, null, 4));
              }
          };
      }
  }

  return projectFile;
} 

/**
 * Remove comments from the file.
 *
 * @param {Object} obj - file object
 * @return {Object} file object without comments
 */
function nonComments(obj) {
  var keys = Object.keys(obj);
  var newObj = {};

  for (var i = 0, len = keys.length; i < len; i++) {
    if (!COMMENT_KEY.test(keys[i])) {
      newObj[keys[i]] = obj[keys[i]];
    }
  }

  return newObj;
}

// endregion

// region Macros injection

/**
 * Inject WKWebView macro into project configuration file.
 *
 * @param {Object} xcodeProject - xcode project file instance
 */
function setMacro(xcodeProject) {
  var configurations = nonComments(xcodeProject.pbxXCBuildConfigurationSection());
  var config;
  var buildSettings;

  for (config in configurations) {
    buildSettings = configurations[config].buildSettings;
    var preprocessorDefs = buildSettings['GCC_PREPROCESSOR_DEFINITIONS'] ? buildSettings['GCC_PREPROCESSOR_DEFINITIONS'] : [];
    if (!preprocessorDefs.length && !isWkWebViewEngineUsed) {
      continue;
    }

    if (!Array.isArray(preprocessorDefs)) {
      preprocessorDefs = [preprocessorDefs];
    }

    var isModified = false;
    var injectedDefinition = strFormat('"%s=%d"', WKWEBVIEW_MACRO, isWkWebViewEngineUsed);
    preprocessorDefs.forEach(function(item, idx) {
      if (item.indexOf(WKWEBVIEW_MACRO) !== -1) {
        preprocessorDefs[idx] = injectedDefinition;
        isModified = true;
      }
    });

    if (!isModified) {
      preprocessorDefs.push(injectedDefinition);
    }

    if (preprocessorDefs.length === 1) {
      buildSettings['GCC_PREPROCESSOR_DEFINITIONS'] = preprocessorDefs[0];
    } else {
      buildSettings['GCC_PREPROCESSOR_DEFINITIONS'] = preprocessorDefs;
    }
  }
}

// endregion
