import argparse


def main() -> None:
    parser = argparse.ArgumentParser(description="OpenMind Bittensor subnet neuron entrypoint.")
    parser.add_argument(
        "--role",
        choices=["miner", "validator"],
        required=True,
        help="Neuron role to run.",
    )
    args = parser.parse_args()

    if args.role == "miner":
        from neurons.miner import run as run_miner

        run_miner()
    elif args.role == "validator":
        from neurons.validator import run as run_validator

        run_validator()


if __name__ == "__main__":
    main()

