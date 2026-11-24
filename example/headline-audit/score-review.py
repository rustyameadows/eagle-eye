"""Grade frozen headline discovery and A/B responses against an independent answer key."""
import argparse
import hashlib
import json
from pathlib import Path


def read(path):
    return json.loads(path.read_text(encoding="utf-8"))


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def keyed(records):
    mapping = {r["id"]: r for r in records}
    if len(mapping) != len(records):
        raise ValueError("Duplicate record ID")
    return mapping


def grade(review, oracle, choices):
    decisions = read(review / "adjudication.json")
    files = {"discovery": review / "discovery.md", "preferences": review / "preferences.json"}
    for key, file in files.items():
        if decisions["frozen"][key] != digest(file):
            raise ValueError(f"Frozen {key} digest mismatch")
    seeds, controls = keyed(oracle["seeds"]), keyed(oracle["controls"])
    rows = decisions["findings"]
    keyed(rows)
    found, flags, supported, others = set(), set(), set(), {}
    directional = 0
    confirmed = 0
    for row in rows:
        disposition = row["status"]
        if not row.get("reason"):
            raise ValueError("Each adjudication needs a reason")
        if disposition == "localized":
            seed = row["case"]
            if seed not in seeds or seed in found or type(row["directionCorrect"]) is not bool:
                raise ValueError(f"Invalid or duplicate match for {seed}")
            assessment = row.get("assessment", "finding")
            if assessment not in {"finding", "comparison-candidate"}:
                raise ValueError("Unknown discovery confidence category")
            confirmed += assessment == "finding"
            found.add(seed)
            directional += row["directionCorrect"]
        elif disposition == "control-flag":
            if row["case"] not in controls:
                raise ValueError("Unknown control")
            flags.add(row["case"])
        elif disposition in {"additional", "duplicate", "unsupported", "indeterminate", "intentional"}:
            if disposition == "additional":
                supported.add(row["id"])
            others[disposition] = 1 + others.get(disposition, 0)
        else:
            raise ValueError(f"Unknown disposition {disposition}")
    ballots = keyed(read(files["preferences"])["items"])
    trials = keyed(choices["items"])
    if set(ballots) != set(trials):
        raise ValueError("Preferences must cover exactly the blinded trial IDs")
    ab = dict(active=0, repair=0, original=0, neutral=0, controls=0, controlNeutral=0)
    results = []
    for id_, trial in trials.items():
        vote = ballots[id_]["choice"]
        if vote not in {"A", "B", "no preference"}:
            raise ValueError(f"Invalid choice for {id_}")
        if trial["control"]:
            ab["controls"] += 1
            ab["controlNeutral"] += vote == "no preference"
            result = "identical / " + vote
        else:
            if trial["candidate"] not in {"A", "B"} or trial["caseId"] not in seeds:
                raise ValueError(f"Invalid active trial {id_}")
            result = "neutral" if vote == "no preference" else ("repair" if vote == trial["candidate"] else "original")
            ab["active"] += 1
            ab[result] += 1
        results.append(dict(id=id_, case=trial["caseId"], profile=trial["profile"], outcome=result))
    return {"discovery": {"eligible": len(seeds), "localized": len(found), "direction": directional,
                          "firm": confirmed, "tentative": len(found) - confirmed,
                          "controlFlags": len(flags), "controls": len(controls), "additional": len(supported),
                          "other": others, "missed": sorted(set(seeds) - found)},
            "preference": ab, "decoded": results, "frozen": decisions["frozen"]}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("run", type=Path, help="Completed run with private/choices.json and review/")
    args = parser.parse_args()
    directory = args.run / "review"
    result = grade(directory, read(Path(__file__).with_name("oracle.json")), read(args.run / "private/choices.json"))
    (directory / "score.json").write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({k: result[k] for k in ("discovery", "preference")}, ensure_ascii=False))


if __name__ == "__main__":
    main()
