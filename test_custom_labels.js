// Test custom labels functionality
console.log('🏷️ TESTING CUSTOM LABELS DROPDOWN');

// Available custom labels from API:
const customLabels = [
  {"id": 2, "userId": 3, "name": "DI", "color": "#ef4444"},
  {"id": 3, "userId": 3, "name": "L3M", "color": "#ef4444"}
];

console.log('✅ Custom labels available:', customLabels.length);
customLabels.forEach(label => {
  console.log(`- ${label.name} (ID: ${label.id}, Color: ${label.color})`);
});

console.log('\n📍 Custom labels dropdown location:');
console.log('1. Click "Upload Video" button in Enhanced Google Drive Video Upload card');
console.log('2. In the dialog, look for "Custom Labels (Meta Insights)" section');
console.log('3. You should see interactive buttons for "DI" and "L3M" with red color indicators');
console.log('4. Click buttons to select/deselect labels for Meta Insights tracking');