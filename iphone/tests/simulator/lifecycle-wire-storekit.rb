require 'pathname'
require 'xcodeproj'

# Use only on the disposable simulator checkout, after the hosted XCTest target exists.
iphone = Pathname.new(__dir__).join('../..').realpath
project_root = iphone.join('ios/App')
project = Xcodeproj::Project.open(project_root.join('App.xcodeproj').to_s)
targets = project.targets.select { |target| target.product_type == 'com.apple.product-type.bundle.unit-test' }
targets = targets.select { |target| target.name == ARGV.first } if ARGV.first
abort "Give the name of the hosted unit-test target. Found #{targets.map(&:name).join(', ')}" unless targets.length == 1
target = targets.first

def reference_for(project, project_root, file)
  absolute = file.realpath
  project.files.find { |entry| entry.real_path.expand_path == absolute } ||
    project.main_group.new_file(absolute.relative_path_from(project_root).to_s)
end

swift = reference_for(project, project_root, iphone.join('tests/simulator/lifecycle-storekit.swift'))
config = reference_for(project, project_root, project_root.join('Wudayn.storekit'))
target.source_build_phase.add_file_reference(swift, true)
target.resources_build_phase.add_file_reference(config, true)
target.build_configurations.each { |config| config.build_settings['ENABLE_TESTING_SEARCH_PATHS'] = 'YES' }
project.save
puts "Wired the local StoreKit test source and Wudayn.storekit into #{target.name}"
