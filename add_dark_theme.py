import re

dark_theme_css = """
[data-theme="dark"] .stat-item {
    background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);
    box-shadow: 0 4px 15px rgba(0, 0, 0, 0.3);
    border-color: rgba(59, 130, 246, 0.2);
}

[data-theme="dark"] .stat-item:hover {
    box-shadow: 0 12px 35px rgba(59, 130, 246, 0.3);
    border-color: rgba(59, 130, 246, 0.4);
}

[data-theme="dark"] .stats-section {
    background: var(--bg-color);
    box-shadow: 0 -2px 20px rgba(0, 0, 0, 0.3);
}

[data-theme="dark"] .feature-card {
    background: var(--card-bg);
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
}

[data-theme="dark"] .feature-card:hover {
    box-shadow: 0 20px 50px rgba(0, 0, 0, 0.4);
}

[data-theme="dark"] .floating-card {
    background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);
    box-shadow: 0 10px 30px rgba(59, 130, 246, 0.15);
    border-color: rgba(59, 130, 246, 0.2);
}

[data-theme="dark"] .floating-card:hover {
    box-shadow: 0 15px 40px rgba(59, 130, 246, 0.25);
}

[data-theme="dark"] .card-label {
    color: var(--text-secondary);
}

[data-theme="dark"] .section-header h2 {
    color: var(--primary-color);
}

[data-theme="dark"] .section-header p {
    color: var(--text-secondary);
}

[data-theme="dark"] .how-it-works {
    background: var(--bg-color);
    border-top-color: rgba(59, 130, 246, 0.2);
    border-bottom-color: rgba(59, 130, 246, 0.2);
}

[data-theme="dark"] .step h3 {
    color: var(--primary-color);
}

[data-theme="dark"] .step p {
    color: var(--text-secondary);
}

[data-theme="dark"] .step-arrow {
    color: var(--primary-color);
}

[data-theme="dark"] .stats-section h2 {
    color: var(--primary-color);
}

[data-theme="dark"] .about-section {
    background: linear-gradient(135deg, #0f172a, #1e293b);
    border-color: rgba(59, 130, 246, 0.2);
}

[data-theme="dark"] .about-section h2 {
    color: var(--primary-color);
}

[data-theme="dark"] .about-feature {
    background: var(--card-bg);
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.3);
}

[data-theme="dark"] .community-section {
    background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
}

[data-theme="dark"] .community-description {
    background: var(--card-bg);
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
    border-color: rgba(59, 130, 246, 0.2);
}

[data-theme="dark"] .community-btn {
    background: var(--card-bg);
    border-color: rgba(59, 130, 246, 0.2);
}

[data-theme="dark"] .weekly-goal-section {
    background: linear-gradient(135deg, var(--card-bg), rgba(30, 41, 59, 0.9));
    border-color: var(--border-color);
}

[data-theme="dark"] .card {
    box-shadow: 0 4px 15px rgba(0, 0, 0, 0.2);
    border-color: rgba(59, 130, 246, 0.2);
}

[data-theme="dark"] .card:hover {
    box-shadow: 0 8px 25px rgba(0, 0, 0, 0.3);
}
"""

with open('style.css', 'a') as f:
    f.write(dark_theme_css)

print('✅ Dark theme CSS added')
