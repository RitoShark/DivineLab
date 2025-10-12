// Test file for SelectorClipData undo functionality
// This simulates the undo system to verify it works correctly

import { 
  addSelectorPair, 
  removeSelectorPair, 
  updateSelectorPairProbability, 
  generateSelectorClipDataText 
} from './SelectorClipDataUtils.js';
import { parseAnimationData } from '../animationParser.js';

// Mock file system for testing
const mockFs = {
  readFileSync: (path, encoding) => {
    return mockFileContent;
  },
  writeFileSync: (path, content, encoding) => {
    mockFileContent = content;
    console.log('📝 File written:', path);
  }
};

// Mock window.require for testing
global.window = {
  require: () => mockFs
};

// Mock state management
let mockTargetData = null;
let mockUndoHistory = [];
let mockFileSaved = false;

const mockSetTargetData = (updater) => {
  if (typeof updater === 'function') {
    mockTargetData = updater(mockTargetData);
  } else {
    mockTargetData = updater;
  }
  console.log('🔄 Target data updated');
};

const mockSetFileSaved = (saved) => {
  mockFileSaved = saved;
  console.log('💾 File saved status:', saved);
};

const mockSetSelectorSearch = (search) => {
  console.log('🔍 Search cleared');
};

const mockSetSelectorOpenFor = (open) => {
  console.log('📂 Open state cleared');
};

const mockCreateMessage = (options) => {
  console.log('📢 Message:', options.title, '-', options.message);
};

// Mock saveStateToHistory function
const mockSaveStateToHistory = async (actionDescription) => {
  console.log('💾 Saving state to history:', actionDescription);
  
  const currentState = {
    targetData: JSON.parse(JSON.stringify(mockTargetData)),
    targetAnimationFile: 'test_animation.py',
    targetSkinsFile: 'test_skins.py',
    fileContent: mockFileContent,
    action: actionDescription
  };
  
  mockUndoHistory.push(currentState);
  console.log('📚 Undo history length:', mockUndoHistory.length);
};

// Mock undo function
const mockUndo = async () => {
  if (mockUndoHistory.length === 0) {
    console.log('❌ Nothing to undo');
    return;
  }

  const lastState = mockUndoHistory.pop();
  console.log('🔄 Undoing:', lastState.action);
  
  // Restore file content
  mockFileContent = lastState.fileContent;
  
  // Restore target data
  mockTargetData = lastState.targetData;
  
  console.log('✅ Undo completed');
};

// Test content
let mockFileContent = `"Recall" = SelectorClipData {
    mSelectorPairDataList: list[embed] = {
        SelectorPairData {
            mClipName: hash = "Joke"
            mProbability: f32 = 0.25
        }
        SelectorPairData {
            mClipName: hash = "Laugh"
            mProbability: f32 = 0.25
        }
    }
}`;

// Initialize test data
const initializeTest = () => {
  console.log('🚀 Initializing test...');
  mockTargetData = {
    animationData: parseAnimationData(mockFileContent)
  };
  mockUndoHistory = [];
  mockFileSaved = true;
  console.log('✅ Test initialized');
  console.log('📊 Initial clips:', Object.keys(mockTargetData.animationData.clips));
};

// Test function
const runUndoTest = async () => {
  console.log('🧪 Starting SelectorClipData Undo Test');
  console.log('=====================================');
  
  initializeTest();
  
  // Test 1: Add a new selector pair
  console.log('\n📝 Test 1: Adding "Dance" with probability 0.3');
  await addSelectorPair(
    'Recall',
    'Dance',
    0.3,
    'test_animation.py',
    mockSaveStateToHistory,
    parseAnimationData,
    mockSetTargetData,
    mockSetFileSaved,
    mockSetSelectorSearch,
    mockSetSelectorOpenFor,
    mockCreateMessage
  );
  
  // Verify the addition
  const afterAdd = parseAnimationData(mockFileContent);
  console.log('📊 After add - selector pairs:', afterAdd.clips['Recall']?.selectorPairs?.length || 0);
  
  // Test 2: Add another pair
  console.log('\n📝 Test 2: Adding "taunt" with probability 0.2');
  await addSelectorPair(
    'Recall',
    'taunt',
    0.2,
    'test_animation.py',
    mockSaveStateToHistory,
    parseAnimationData,
    mockSetTargetData,
    mockSetFileSaved,
    mockSetSelectorSearch,
    mockSetSelectorOpenFor,
    mockCreateMessage
  );
  
  // Verify the second addition
  const afterSecondAdd = parseAnimationData(mockFileContent);
  console.log('📊 After second add - selector pairs:', afterSecondAdd.clips['Recall']?.selectorPairs?.length || 0);
  
  // Test 3: Update probability
  console.log('\n📝 Test 3: Updating "Dance" probability to 0.5');
  await updateSelectorPairProbability(
    'Recall',
    2, // Index of "Dance" (should be 2nd in list)
    0.5,
    'test_animation.py',
    mockSaveStateToHistory,
    parseAnimationData,
    mockSetTargetData,
    mockSetFileSaved,
    mockCreateMessage
  );
  
  // Verify the update
  const afterUpdate = parseAnimationData(mockFileContent);
  const dancePair = afterUpdate.clips['Recall']?.selectorPairs?.find(p => p.clipName === 'Dance');
  console.log('📊 After update - Dance probability:', dancePair?.probability);
  
  // Test 4: Remove a pair
  console.log('\n📝 Test 4: Removing "Laugh" (index 1)');
  await removeSelectorPair(
    'Recall',
    1, // Index of "Laugh"
    'test_animation.py',
    mockSaveStateToHistory,
    parseAnimationData,
    mockSetTargetData,
    mockSetFileSaved,
    mockCreateMessage
  );
  
  // Verify the removal
  const afterRemove = parseAnimationData(mockFileContent);
  console.log('📊 After remove - selector pairs:', afterRemove.clips['Recall']?.selectorPairs?.length || 0);
  console.log('📊 Remaining pairs:', afterRemove.clips['Recall']?.selectorPairs?.map(p => p.clipName) || []);
  
  // Test 5: Undo operations
  console.log('\n🔄 Test 5: Testing undo functionality');
  console.log('📚 Undo history length before undo:', mockUndoHistory.length);
  
  // Undo 1: Remove operation
  console.log('\n🔄 Undo 1: Undoing remove operation');
  await mockUndo();
  const afterUndo1 = parseAnimationData(mockFileContent);
  console.log('📊 After undo 1 - selector pairs:', afterUndo1.clips['Recall']?.selectorPairs?.length || 0);
  console.log('📊 Pairs after undo 1:', afterUndo1.clips['Recall']?.selectorPairs?.map(p => `${p.clipName}(${p.probability})`) || []);
  
  // Undo 2: Update operation
  console.log('\n🔄 Undo 2: Undoing update operation');
  await mockUndo();
  const afterUndo2 = parseAnimationData(mockFileContent);
  const dancePairAfterUndo2 = afterUndo2.clips['Recall']?.selectorPairs?.find(p => p.clipName === 'Dance');
  console.log('📊 After undo 2 - Dance probability:', dancePairAfterUndo2?.probability);
  
  // Undo 3: Second add operation
  console.log('\n🔄 Undo 3: Undoing second add operation');
  await mockUndo();
  const afterUndo3 = parseAnimationData(mockFileContent);
  console.log('📊 After undo 3 - selector pairs:', afterUndo3.clips['Recall']?.selectorPairs?.length || 0);
  console.log('📊 Pairs after undo 3:', afterUndo3.clips['Recall']?.selectorPairs?.map(p => `${p.clipName}(${p.probability})`) || []);
  
  // Undo 4: First add operation
  console.log('\n🔄 Undo 4: Undoing first add operation');
  await mockUndo();
  const afterUndo4 = parseAnimationData(mockFileContent);
  console.log('📊 After undo 4 - selector pairs:', afterUndo4.clips['Recall']?.selectorPairs?.length || 0);
  console.log('📊 Pairs after undo 4:', afterUndo4.clips['Recall']?.selectorPairs?.map(p => `${p.clipName}(${p.probability})`) || []);
  
  // Final verification
  console.log('\n✅ Final verification:');
  console.log('📚 Remaining undo history:', mockUndoHistory.length);
  console.log('📊 Final file content:');
  console.log(mockFileContent);
  
  console.log('\n🎉 Undo test completed!');
};

// Run the test
runUndoTest().catch(console.error);
