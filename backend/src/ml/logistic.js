// Small, dependency-free logistic regression. Everything here is pure (no database), so it is easy to test.
//
// A model is { names, mean, std, weights, bias }. Features are standardised ((x - mean) / std) before use,
// so the weights are comparable with each other and can be read as "how strongly this pushes the risk up or down".

const sigmoid = (z) => 1 / (1 + Math.exp(-z));

function fitScaler(X) {
    const d = X[0].length;
    const mean = new Array(d).fill(0), std = new Array(d).fill(0);
    for (const row of X) for (let j = 0; j < d; j++) mean[j] += row[j];
    for (let j = 0; j < d; j++) mean[j] /= X.length;
    for (const row of X) for (let j = 0; j < d; j++) std[j] += (row[j] - mean[j]) ** 2;
    for (let j = 0; j < d; j++) std[j] = Math.sqrt(std[j] / X.length) || 1;   // a constant column must not divide by zero
    return { mean, std };
}

const standardise = (x, mean, std) => x.map((v, j) => (v - mean[j]) / std[j]);

// Full-batch gradient descent with L2 regularisation and balanced class weights
// (so a rare "poor adherence" class is not ignored just because it is rare).
function train(X, y, names, { l2 = 0.2, lr = 0.2, epochs = 600 } = {}) {
    const { mean, std } = fitScaler(X);
    const Z = X.map((row) => standardise(row, mean, std));
    const d = names.length, n = Z.length;
    const pos = y.reduce((a, b) => a + b, 0), neg = n - pos;
    const wPos = pos ? n / (2 * pos) : 1, wNeg = neg ? n / (2 * neg) : 1;
    const w = new Array(d).fill(0);
    let b = 0;
    for (let epoch = 0; epoch < epochs; epoch++) {
        const gw = new Array(d).fill(0);
        let gb = 0;
        for (let i = 0; i < n; i++) {
            let z = b;
            for (let j = 0; j < d; j++) z += w[j] * Z[i][j];
            const cw = y[i] ? wPos : wNeg;
            const err = (sigmoid(z) - y[i]) * cw;
            for (let j = 0; j < d; j++) gw[j] += err * Z[i][j];
            gb += err;
        }
        for (let j = 0; j < d; j++) w[j] -= lr * (gw[j] / n + l2 * w[j]);
        b -= lr * (gb / n);
    }
    return { names, mean, std, weights: w, bias: b };
}

function linear(model, x) {
    const z = standardise(x, model.mean, model.std);
    let s = model.bias;
    const parts = z.map((v, j) => model.weights[j] * v);
    for (const p of parts) s += p;
    return { logit: s, parts };
}

const predict = (model, x) => sigmoid(linear(model, x).logit);

// Area under the ROC curve = the chance that a random positive example scores higher than a random negative one.
// Ties count half. 0.5 is a coin flip, 1.0 is perfect.
function auc(scores, labels) {
    const idx = scores.map((s, i) => i).sort((a, b) => scores[a] - scores[b]);
    let rankSumPos = 0, pos = 0, i = 0;
    while (i < idx.length) {
        let j = i;
        while (j + 1 < idx.length && scores[idx[j + 1]] === scores[idx[i]]) j++;
        const avgRank = (i + j) / 2 + 1;
        for (let k = i; k <= j; k++) if (labels[idx[k]]) { rankSumPos += avgRank; pos++; }
        i = j + 1;
    }
    const neg = labels.length - pos;
    if (!pos || !neg) return null;
    return (rankSumPos - (pos * (pos + 1)) / 2) / (pos * neg);
}

function classification(scores, labels, threshold = 0.5) {
    let tp = 0, fp = 0, tn = 0, fn = 0;
    scores.forEach((s, i) => {
        const p = s >= threshold;
        if (p && labels[i]) tp++; else if (p) fp++; else if (labels[i]) fn++; else tn++;
    });
    return {
        accuracy: (tp + tn) / (scores.length || 1),
        precision: tp + fp ? tp / (tp + fp) : null,
        recall: tp + fn ? tp / (tp + fn) : null,
        tp, fp, tn, fn
    };
}

module.exports = { sigmoid, train, predict, linear, auc, classification };
