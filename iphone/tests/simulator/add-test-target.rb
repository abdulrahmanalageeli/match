require 'xcodeproj'
require 'fileutils'

# Generate the hosted test target in the disposable runner checkout only.
dir = 'ios/App'
bundle = "#{dir}/App.xcodeproj"
project = Xcodeproj::Project.open(bundle)
host = project.targets.find { |t| t.name == 'App' }
target = project.new_target(:unit_test_bundle, 'SimulatorChecks', :ios, '16.0')
target.add_dependency(host)
FileUtils.cp(File.join(__dir__, 'SimulatorChecks.swift'), dir)
target.source_build_phase.add_file_reference(project.main_group.new_file('SimulatorChecks.swift'))
target.build_configurations.each do |config|
  config.build_settings.merge!({
    'PRODUCT_BUNDLE_IDENTIFIER'=>'com.blindmatch.marriage.simulatorchecks',
    'GENERATE_INFOPLIST_FILE'=>'YES', 'SWIFT_VERSION'=>'5.0',
    'TEST_HOST'=>'$(BUILT_PRODUCTS_DIR)/App.app/App', 'BUNDLE_LOADER'=>'$(TEST_HOST)'
  })
end
project.save
scheme = Xcodeproj::XCScheme.new("#{bundle}/xcshareddata/xcschemes/App.xcscheme")
scheme.add_test_target(target)
scheme.save_as(bundle, 'App')
