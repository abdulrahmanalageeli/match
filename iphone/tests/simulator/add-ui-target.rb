require 'xcodeproj'
require 'fileutils'
dir = 'ios/App'
bundle = "#{dir}/App.xcodeproj"
project = Xcodeproj::Project.open(bundle)
host = project.targets.find { |t| t.name == 'App' }
target = project.new_target(:ui_test_bundle, 'ExperienceAudit', :ios, '16.0')
target.add_dependency(host)
FileUtils.cp(File.join(__dir__, 'ExperienceAudit.swift'), dir)
target.source_build_phase.add_file_reference(project.main_group.new_file('ExperienceAudit.swift'))
target.build_configurations.each do |config|
  config.build_settings.merge!({
    'TEST_TARGET_NAME'=>'App', 'PRODUCT_NAME'=>'ExperienceAudit',
    'PRODUCT_BUNDLE_IDENTIFIER'=>'com.blindmatch.marriage.audit',
    'GENERATE_INFOPLIST_FILE'=>'YES','SWIFT_VERSION'=>'5.0'
  })
end
project.save
scheme = Xcodeproj::XCScheme.new("#{bundle}/xcshareddata/xcschemes/App.xcscheme")
scheme.add_test_target(target)
scheme.save_as(bundle, 'App')

# Only the simulator runner's disposable app has this fixture launch override.
controller = "#{dir}/App/MarriageBridgeController.swift"
File.write(controller, "import Foundation\n" + File.read(controller).sub('override func capacitorDidLoad()', <<~SWIFT))
  override func instanceDescriptor() -> InstanceDescriptor {
      let descriptor = super.instanceDescriptor()
      if let page = ProcessInfo.processInfo.environment["AUDIT_PAGE"],
         ["messages", "recipient", "birthday"].contains(page) {
          descriptor.appStartPath = page + ".html"
      }
      return descriptor
  }
  override func capacitorDidLoad()
SWIFT
