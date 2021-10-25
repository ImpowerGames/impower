import * as firebase from "@firebase/rules-unit-testing";
import { MY_EMAIL } from "../../constants";
import { getClient } from "../../utils";

export const testMessages = (path: string) => {
  it("can create with required fields", async () => {
    const client = getClient();
    await firebase.assertSucceeds(
      client.database().ref(path).set({
        fullName: "Jane Doe",
        email: MY_EMAIL,
        message: "this is a message",
      })
    );
  });
  it("CANNOT create with message longer than 2000 characters", async () => {
    const client = getClient();
    await firebase.assertFails(
      client.database().ref(path).set({
        fullName: "Jane Doe",
        email: MY_EMAIL,
        message:
          "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed vehicula posuere leo, at feugiat mauris pellentesque ac. Ut sagittis purus non libero venenatis tempor. Phasellus et lobortis lectus. Aenean ac risus dapibus, scelerisque est in, faucibus arcu. Sed sit amet orci vel magna hendrerit commodo in a lacus. Quisque urna dui, consectetur a scelerisque nec, ornare ut enim. Fusce sit amet eros facilisis, dignissim nibh consequat, vestibulum mauris. Integer sollicitudin, augue eu condimentum mattis, ipsum odio lacinia lorem, id porttitor justo metus vel ipsum. Aenean efficitur risus vel purus feugiat, id malesuada dolor lacinia. Proin ullamcorper mauris nec pulvinar bibendum. Sed cursus dapibus odio, eu ultrices turpis porta at. Vestibulum porta interdum velit id pulvinar. In viverra vitae mi in dapibus. Pellentesque dictum ligula at dolor tempor euismod. Donec fermentum, diam nec accumsan fringilla, lacus eros dictum lorem, sed efficitur sapien augue id lorem. Proin sem sapien molestie. Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed vehicula posuere leo, at feugiat mauris pellentesque ac. Ut sagittis purus non libero venenatis tempor. Phasellus et lobortis lectus. Aenean ac risus dapibus, scelerisque est in, faucibus arcu. Sed sit amet orci vel magna hendrerit commodo in a lacus. Quisque urna dui, consectetur a scelerisque nec, ornare ut enim. Fusce sit amet eros facilisis, dignissim nibh consequat, vestibulum mauris. Integer sollicitudin, augue eu condimentum mattis, ipsum odio lacinia lorem, id porttitor justo metus vel ipsum. Aenean efficitur risus vel purus feugiat, id malesuada dolor lacinia. Proin ullamcorper mauris nec pulvinar bibendum. Sed cursus dapibus odio, eu ultrices turpis porta at. Vestibulum porta interdum velit id pulvinar. In viverra vitae mi in dapibus. Pellentesque dictum ligula at dolor tempor euismod. Donec fermentum, diam nec accumsan fringilla, lacus eros dictum lorem, sed efficitur sapien augue id lorem. Proin sem sapien molestie.",
      })
    );
  });
  it("CANNOT create without required fields", async () => {
    const client = getClient();
    await firebase.assertFails(
      client.database().ref(path).set({
        fullName: "Jane Doe",
        message: "this is a message",
      })
    );
  });
  it("CANNOT create with restricted or unrecognized fields", async () => {
    const client = getClient();
    await firebase.assertFails(
      client.database().ref(path).set({
        fullName: "Jane Doe",
        email: MY_EMAIL,
        message: "this is a message",
        admin: true,
      })
    );
  });
  it("CANNOT update", async () => {
    const admin = getClient();
    await admin.database().ref(path).set({
      fullName: "Jane Doe",
      email: MY_EMAIL,
      message: "this is a message",
    });
    const client = getClient();
    await firebase.assertFails(
      client.database().ref(path).update({
        fullName: "Jane Doe",
        email: MY_EMAIL,
        message: "this is a message 2",
      })
    );
  });
  it("CANNOT read", async () => {
    const client = getClient();
    await firebase.assertFails(client.database().ref(path).get());
  });
  it("CANNOT remove", async () => {
    const client = getClient();
    await firebase.assertFails(client.database().ref(path).remove());
  });
};
