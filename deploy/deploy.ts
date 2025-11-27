import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy } = hre.deployments;

  const deployedVoteOblivion = await deploy("VoteOblivion", {
    from: deployer,
    log: true,
  });

  console.log(`VoteOblivion contract: `, deployedVoteOblivion.address);
};
export default func;
func.id = "deploy_voteOblivion"; // id required to prevent reexecution
func.tags = ["VoteOblivion"];
