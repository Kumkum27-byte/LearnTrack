#!/usr/bin/env python3
import re

with open('style.css', 'r', encoding='utf-8') as f:
    content = f.read()

# Remove all lines that contain [data-theme="dark"]
lines = content.split('\n')
result_lines = []
skip_block = False
brace_depth = 0

for line in lines:
    # Check if line starts a dark theme block
    if '[data-theme="dark"]' in line:
        skip_block = True
        brace_depth = 0
    
    if skip_block:
        # Count braces to find end of block
        brace_depth += line.count('{') - line.count('}')
        if brace_depth <= 0 and '{' in line:
            skip_block = False
        continue
    
    result_lines.append(line)

with open('style.css', 'w', encoding='utf-8') as f:
    f.write('\n'.join(result_lines))

print('✅ Dark theme CSS removed')
