// Test script to verify the plugin exports correctly
import {LlamaCppPlugin} from "./src"

// Log the imported value
console.log("Plugin type:", typeof LlamaCppPlugin)

// Try to call it if it's a function
if (typeof LlamaCppPlugin === "function") {
    console.log("✓ Plugin is a function")
} else {
    console.error("✗ Plugin is not a function")
    process.exit(1)
}

// Test that it has the V2 Plugin shape
const plugin = LlamaCppPlugin as any
if (plugin.id) {
    console.log("✓ Plugin has id:", plugin.id)
} else {
    console.error("✗ Plugin missing id")
    process.exit(1)
}

if (typeof plugin.setup === "function") {
    console.log("✓ Plugin has setup function")
} else {
    console.error("✗ Plugin missing setup function")
    process.exit(1)
}

console.log("\n✅ All checks passed!")
