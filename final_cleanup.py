import re

# Read the CSS file
with open('style.css', 'r', encoding='utf-8') as f:
    content = f.read()

# Find all occurrences of [data-theme="dark"] and their blocks
# This pattern matches the selector up to and including the closing brace
pattern = r'\n*\s*\[data-theme="dark"\][^\{]*\{[^\}]*\}\n*'

# Replace with nothing
cleaned = re.sub(pattern, '\n', content, flags=re.MULTILINE)

# Remove any orphaned closing braces and excessive newlines
cleaned = re.sub(r'\n\s*\n\s*\n', '\n\n', cleaned)

# Write back
with open('style.css', 'w', encoding='utf-8') as f:
    f.write(cleaned)

# Count remaining
remaining = len(re.findall(r'\[data-theme="dark"\]', cleaned))
print(f'✅ Removed dark theme CSS - {remaining} instances remaining')
