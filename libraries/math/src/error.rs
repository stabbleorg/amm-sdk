use thiserror::Error;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Error)]
pub enum WeightedMathError {
    #[error("Zero invariant")]
    ZeroInvariant,

    #[error("MaxInRatio")]
    MaxInRatio,

    #[error("MaxOutRatio")]
    MaxOutRatio,

    #[error("MinInvariantRatio")]
    MinInvariantRatio,

    #[error("MaxInvariantRatio")]
    MaxInvariantRatio,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Error)]
pub enum StableMathError {
    #[error("Invariant didnt converge")]
    InvariantDidntConverge,

    #[error("Get balance didnt converge")]
    GetBalanceDidntConverge,
}
