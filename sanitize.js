const MAX_FIELD_LENGTH = 500;

function toSafeString(value, maxLength = MAX_FIELD_LENGTH) {
    if (typeof value !== 'string') return '';
    return value.trim().slice(0, maxLength);
}

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function normalizeAccountInput(input = {}) {
    return {
        email: toSafeString(input.email, 254),
        username: toSafeString(input.username, 120),
        password: toSafeString(input.password, 200),
        totp: toSafeString(input.totp, 120),
    };
}

module.exports = { escapeHtml, normalizeAccountInput, toSafeString };
