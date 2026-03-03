#!/usr/bin/env python3
import re

# Read the entire CSS file
with open('style.css', 'r', encoding='utf-8') as f:
    content = f.read()

# Split into lines
lines = content.split('\n')

# Process lines
output = []
skip = False
for i, line in enumerate(lines):
    # Check if this line contains [data-theme="dark"]
    if '[data-theme="dark"]' in line:
        skip = True
        brace_count = line.count('{') - line.count('}')
        # Keep skipping until we find the matching closing brace
        j = i + 1
        while j < len(lines) and brace_count > 0:
            brace_count += lines[j].count('{') - lines[j].count('}')
            j += 1
        # Skip all lines until the end of this block
        # We need to update the main loop counter, but we can't directly
        # Instead, mark lines to skip
        for skip_idx in range(i, j):
            if skip_idx < len(lines):
                lines[skip_idx] = '__SKIP__'
        continue
    
    if line != '__SKIP__':
        output.append(line)

# Write back
with open('style.css', 'w', encoding='utf-8') as f:
    f.write('\n'.join(output))

print('✅ All dark theme CSS removed')
